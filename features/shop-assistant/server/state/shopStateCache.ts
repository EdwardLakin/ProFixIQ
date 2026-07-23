import "server-only";

import type { ShopAssistantActor } from "@/features/shop-assistant/server/requireShopAssistantActor";
import { buildShopState } from "@/features/shop-assistant/server/state/buildShopState";
import { createShopAssistantStateAdminClient } from "@/features/shop-assistant/server/state/database";
import {
  SHOP_ASSISTANT_MAX_STALE_MS,
  SHOP_ASSISTANT_STATE_TTL_MS,
  type ShopAssistantState,
} from "@/features/shop-assistant/server/state/types";
import type { Json } from "@shared/types/types/supabase";
import type { ShopAssistantStateSnapshotRow } from "@shared/types/types/supabase-shop-assistant";

const DEFAULT_TTL_MS = SHOP_ASSISTANT_STATE_TTL_MS;
const SNAPSHOT_SELECT =
  "shop_id, user_id, role, snapshot, version, refreshed_at, expires_at, invalidated_at, updated_at";

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
): Promise<ShopAssistantStateSnapshotRow | null> {
  const { data, error } = await createShopAssistantStateAdminClient()
    .from("shop_assistant_state_snapshots")
    .select(SNAPSHOT_SELECT)
    .eq("shop_id", actor.shopId)
    .eq("user_id", actor.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
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
  const expiresAtMs = new Date(existing?.expires_at ?? 0).getTime();
  const isFresh = Boolean(
    !params.force &&
      existingState &&
      !existing?.invalidated_at &&
      Number.isFinite(expiresAtMs) &&
      expiresAtMs > nowMs,
  );
  const canUseStaleFallback = Boolean(
    existingState &&
      !existing?.invalidated_at &&
      Number.isFinite(expiresAtMs) &&
      nowMs - expiresAtMs <= SHOP_ASSISTANT_MAX_STALE_MS,
  );
  if (isFresh && existingState) return existingState;

  try {
    const state = await buildShopState(params.actor);
    const refreshedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();
    const snapshot = JSON.parse(JSON.stringify(state)) as Json;
    const { error } = await createShopAssistantStateAdminClient()
      .from("shop_assistant_state_snapshots")
      .upsert(
        {
          shop_id: params.actor.shopId,
          user_id: params.actor.userId,
          role: params.actor.role,
          snapshot,
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
    if (canUseStaleFallback && existingState) return existingState;
    throw error;
  }
}

export async function invalidateShopState(
  actor: ShopAssistantActor,
): Promise<void> {
  const { error } = await createShopAssistantStateAdminClient().rpc(
    "invalidate_shop_assistant_state_snapshots",
    {
      p_shop_id: actor.shopId,
      p_actor_user_id: actor.userId,
    },
  );
  if (error) throw new Error(error.message);
}
