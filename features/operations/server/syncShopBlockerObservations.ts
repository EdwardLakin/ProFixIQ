import "server-only";

import type { Database, Json } from "@shared/types/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOpsNotifications } from "@/features/agent/server/getOpsNotifications";
import { buildFingerprint } from "@/features/agent/server/syncAssistantNotifications";

type ServerClient = SupabaseClient<Database>;

// Phase 3 of the dashboard assistant plan: a scheduled, shop-wide blocker
// observer. It reuses the same detection rules already computed on-demand
// by getOpsNotifications (stalled work orders, overdue approvals, delayed
// parts, idle/overloaded technicians, etc.) but runs them without a live
// viewer, on a schedule, across every shop, and persists durable,
// deduplicated findings into shop_blocker_observations instead of the
// user-facing assistant_notifications table.
//
// Shadow mode: this only observes and records. It never mutates shop
// workflow state, and shop_blocker_observations is not read by any
// existing assistant/dashboard surface.

const SHOP_SCOPE_KEY = "shop";

export type ShopBlockerObservationRow = {
  id: string;
  fingerprint: string;
  status: string;
  first_seen_at: string;
};

export type ShopBlockerObservationSummary = {
  shopId: string;
  observed: number;
  opened: number;
  continuing: number;
  resolved: number;
  errors: string[];
};

async function loadExistingObservations(input: {
  supabase: ServerClient;
  shopId: string;
}): Promise<Map<string, ShopBlockerObservationRow>> {
  const { data, error } = await input.supabase
    .from("shop_blocker_observations")
    .select("id, fingerprint, status, first_seen_at")
    .eq("shop_id", input.shopId);

  if (error) throw new Error(error.message);

  return new Map((data ?? []).map((row) => [row.fingerprint, row]));
}

export async function syncShopBlockerObservations(input: {
  supabase: ServerClient;
  shopId: string;
  now?: Date;
}): Promise<ShopBlockerObservationSummary> {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();

  const [notifications, existingByFingerprint] = await Promise.all([
    getOpsNotifications(input.shopId, input.supabase),
    loadExistingObservations({
      supabase: input.supabase,
      shopId: input.shopId,
    }),
  ]);

  const activeFingerprints = new Set<string>();
  let opened = 0;
  let continuing = 0;
  const errors: string[] = [];

  const upsertRows = notifications.map((notification) => {
    const fingerprint = buildFingerprint(
      {
        code: notification.code,
        entityType: notification.entityType,
        entityId: notification.entityId,
        href: notification.href,
      },
      SHOP_SCOPE_KEY,
    );
    activeFingerprints.add(fingerprint);

    const existing = existingByFingerprint.get(fingerprint);
    if (existing && existing.status === "active") {
      continuing += 1;
    } else {
      opened += 1;
    }

    // The rule inputs the observer actually saw, so a later false-positive
    // review does not have to reconstruct "why" from the message string.
    const reason: Json = {
      level: notification.level,
      code: notification.code,
      entity_type: notification.entityType ?? null,
      entity_id: notification.entityId ?? null,
      href: notification.href ?? null,
      message: notification.message,
    };

    return {
      shop_id: input.shopId,
      fingerprint,
      code: notification.code,
      level: notification.level === "urgent" ? "critical" : notification.level,
      title: notification.title,
      message: notification.message,
      href: notification.href ?? null,
      entity_type: notification.entityType ?? null,
      entity_id: notification.entityId ?? null,
      reason,
      status: "active",
      first_seen_at: existing?.first_seen_at ?? nowIso,
      last_seen_at: nowIso,
      resolved_at: null,
      updated_at: nowIso,
    };
  });

  if (upsertRows.length > 0) {
    const { error: upsertError } = await input.supabase
      .from("shop_blocker_observations")
      .upsert(upsertRows, { onConflict: "shop_id,fingerprint" });

    if (upsertError) errors.push(upsertError.message);
  }

  const toResolve = Array.from(existingByFingerprint.values())
    .filter((row) => row.status !== "resolved")
    .filter((row) => !activeFingerprints.has(row.fingerprint))
    .map((row) => row.id);

  if (toResolve.length > 0) {
    const { error: resolveError } = await input.supabase
      .from("shop_blocker_observations")
      .update({
        status: "resolved",
        resolved_at: nowIso,
        updated_at: nowIso,
      })
      .eq("shop_id", input.shopId)
      .in("id", toResolve);

    if (resolveError) errors.push(resolveError.message);
  }

  return {
    shopId: input.shopId,
    observed: notifications.length,
    opened,
    continuing,
    resolved: toResolve.length,
    errors,
  };
}
