import "server-only";

import type { Database, Json } from "@shared/types/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOpsNotifications } from "@/features/agent/server/getOpsNotifications";

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

// getOpsNotifications is designed around a live viewer requesting it during
// business hours. tech_underutilized_capacity only requires a technician to
// have had shift time today and no current active job - it does not check
// whether that shift has since ended. Queried on demand that's rarely wrong
// (nobody is looking at the dashboard after close), but this observer runs
// hourly around the clock, so it would otherwise record "idle capacity"
// long after a shop has closed for the day. Excluding it here (rather than
// changing the shared, live-used detection function) keeps this fix local
// to the scheduled path that actually has the false-positive exposure.
const EXCLUDED_SCHEDULED_CODES = new Set(["tech_underutilized_capacity"]);

// A single run can under-report what's actually still active:
// getOpsNotifications caps several of its source queries (120-150 rows) and
// silently swallows optimization-enrichment failures. Resolving the instant
// a fingerprint is merely absent from one run would let a transient/capped
// scan wrongly close out a still-active finding, corrupting the very
// lifecycle history this table exists to let someone evaluate. Requiring a
// finding to have gone unseen for a full extra cron cycle before resolving
// it is a cheap, local hedge against that without changing
// getOpsNotifications' contract.
const RESOLUTION_GRACE_MS = 2 * 60 * 60 * 1000; // 2 hours (~2 cron cycles)

export type ShopBlockerObservationRow = {
  id: string;
  fingerprint: string;
  status: string;
  first_seen_at: string;
  last_seen_at: string;
};

export type ShopBlockerObservationSummary = {
  shopId: string;
  observed: number;
  opened: number;
  continuing: number;
  resolved: number;
  errors: string[];
};

// Deliberately excludes href: a finding's destination link can change (an
// inspection-coverage opportunity's link moves once a template exists,
// for example) while the underlying blocker is unchanged. Including it
// would fork one blocker into a "resolved" row plus a "new" one and
// corrupt the lifecycle/false-positive history this table exists to
// support - so identity here is intentionally narrower than the shared,
// display-oriented assistant_notifications fingerprint.
function buildBlockerFingerprint(item: {
  code: string;
  entityType?: string;
  entityId?: string;
}): string {
  return [
    SHOP_SCOPE_KEY,
    item.code,
    item.entityType ?? "na",
    item.entityId ?? "na",
  ].join("::");
}

async function loadExistingObservations(input: {
  supabase: ServerClient;
  shopId: string;
}): Promise<Map<string, ShopBlockerObservationRow>> {
  const { data, error } = await input.supabase
    .from("shop_blocker_observations")
    .select("id, fingerprint, status, first_seen_at, last_seen_at")
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

  const [allNotifications, existingByFingerprint] = await Promise.all([
    getOpsNotifications(input.shopId, input.supabase),
    loadExistingObservations({
      supabase: input.supabase,
      shopId: input.shopId,
    }),
  ]);

  const notifications = allNotifications.filter(
    (item) => !EXCLUDED_SCHEDULED_CODES.has(item.code),
  );

  const activeFingerprints = new Set<string>();
  let opened = 0;
  let continuing = 0;
  const errors: string[] = [];

  const upsertRows = notifications.map((notification) => {
    const fingerprint = buildBlockerFingerprint({
      code: notification.code,
      entityType: notification.entityType,
      entityId: notification.entityId,
    });
    activeFingerprints.add(fingerprint);

    const existing = existingByFingerprint.get(fingerprint);
    if (existing && existing.status === "active") {
      continuing += 1;
    } else {
      opened += 1;
    }

    // The rule inputs the observer actually saw - including the specific
    // thresholds/values each rule fired on (notification.evidence) - so a
    // later false-positive review does not have to reconstruct "why" from
    // the presentation message string alone.
    const reason: Json = {
      level: notification.level,
      code: notification.code,
      entity_type: notification.entityType ?? null,
      entity_id: notification.entityId ?? null,
      href: notification.href ?? null,
      message: notification.message,
      evidence: (notification.evidence ?? {}) as Json,
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

  const resolutionCandidates = Array.from(existingByFingerprint.values())
    .filter((row) => row.status !== "resolved")
    .filter((row) => !activeFingerprints.has(row.fingerprint))
    .filter(
      (row) =>
        now.getTime() - new Date(row.last_seen_at).getTime() >=
        RESOLUTION_GRACE_MS,
    );

  let resolved = 0;
  if (resolutionCandidates.length > 0) {
    const results = await Promise.all(
      resolutionCandidates.map(async (row) => {
        // Conditioned on the last_seen_at we just read: if a concurrent,
        // fresher run has since re-upserted this fingerprint as active
        // (bumping last_seen_at), this update matches zero rows instead of
        // clobbering that fresher state with "resolved".
        const { data, error } = await input.supabase
          .from("shop_blocker_observations")
          .update({
            status: "resolved",
            resolved_at: nowIso,
            updated_at: nowIso,
          })
          .eq("id", row.id)
          .eq("shop_id", input.shopId)
          .eq("last_seen_at", row.last_seen_at)
          .select("id");

        return { error, resolved: !error && (data?.length ?? 0) > 0 };
      }),
    );

    for (const result of results) {
      if (result.error) errors.push(result.error.message);
      if (result.resolved) resolved += 1;
    }
  }

  return {
    shopId: input.shopId,
    observed: notifications.length,
    opened,
    continuing,
    resolved,
    errors,
  };
}
