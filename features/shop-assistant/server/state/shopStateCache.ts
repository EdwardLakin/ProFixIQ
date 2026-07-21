import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ShopAssistantActor } from "@/features/shop-assistant/server/requireShopAssistantActor";
import { buildShopState } from "@/features/shop-assistant/server/state/buildShopState";
import type { ShopAssistantState } from "@/features/shop-assistant/server/state/types";

type AssistantDb = SupabaseClient<any>;

type SnapshotRow = {
  shop_id: string;
  user_id: string;
  role: string | null;
  snapshot: unknown;
  version: number;
  refreshed_at: string;
  expires_at: string;
  invalidated_at: string | null;
  updated_at: string;
};

const DEFAULT_TTL_MS = 30_000;
const SNAPSHOT_SELECT =
  "shop_id, user_id, role, snapshot, version, refreshed_at, expires_at, invalidated_at, updated_at";

function dbFor(actor: ShopAssistantActor): AssistantDb {
  return actor.supabase as unknown as AssistantDb;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isShopAssistantState(value: unknown): value is ShopAssistantState {
  if (!isRecord(value)) return false;
  return (
    typeof value.generatedAt === "string" &&
    typeof value.role === "string" &&
    typeof value.headline === "string" &&
    isRecord(value.metrics) &&
    Array.isArray(value.alerts) &&
    Array.isArray(value.suggestions)
  );
}

async function loadSnapshot(
  actor: ShopAssistantActor,
): Promise<SnapshotRow | null> {
  const { data, error } = await dbFor(actor)
    .from("shop_assistant_state_snapshots")
    .select(SNAPSHOT_SELECT)
    .eq("shop_id", actor.shopId)
    .eq("user_id", actor.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SnapshotRow | null) ?? null;
}

export async function getOrRefreshShopState(params: {
  actor: ShopAssistantActor;
  force?: boolean;
  ttlMs?: number;
}): Promise<ShopAssistantState> {
  const ttlMs = Math.min(
    Math.max(params.ttlMs ?? DEFAULT_TTL_MS, 5_000),
    120_000,
  );
  const nowMs = Date.now();
  const existing = await loadSnapshot(params.actor).catch(() => null);
  const roleMatches =
    (existing?.role ?? null) === (params.actor.role ?? null);
  const existingSnapshot = existing?.snapshot;
  const existingState =
    roleMatches && isShopAssistantState(existingSnapshot)
      ? existingSnapshot
      : null;
  const isFresh = Boolean(
    !params.force &&
      existingState &&
      !existing?.invalidated_at &&
      new Date(existing?.expires_at ?? 0).getTime() > nowMs,
  );
  if (isFresh && existingState) return existingState;

  try {
    const state = await buildShopState(params.actor);
    const refreshedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();
    const { error } = await dbFor(params.actor)
      .from("shop_assistant_state_snapshots")
      .upsert(
        {
          shop_id: params.actor.shopId,
          user_id: params.actor.userId,
          role: params.actor.role,
          snapshot: state,
          version: Number(existing?.version ?? 0) + 1,
          refreshed_at: refreshedAt,
          expires_at: expiresAt,
          invalidated_at: null,
          updated_at: refreshedAt,
        },
        { onConflict: "shop_id,user_id" },
      );
    if (error) throw new Error(error.message);
    return state;
  } catch (error: unknown) {
    if (existingState) return existingState;
    throw error;
  }
}

export async function invalidateShopState(
  actor: ShopAssistantActor,
): Promise<void> {
  const { error } = await dbFor(actor).rpc(
    "invalidate_shop_assistant_state_snapshots",
    {
      p_shop_id: actor.shopId,
      p_actor_user_id: actor.userId,
    },
  );
  if (error) throw new Error(error.message);
}
