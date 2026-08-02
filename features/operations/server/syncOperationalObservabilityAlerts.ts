import "server-only";

import type { Database, Json } from "@shared/types/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAiOperationsObservability } from "@/features/ai/server";
import { getOperationalObservability } from "./getOperationalObservability";

type ServerClient = SupabaseClient<Database>;
type AlertLevel = "info" | "warning" | "critical";
type ExistingAlertState = {
  status: string;
  firstSeenAt: string | null;
};
type OperationalEventCountResult = {
  count: number | null;
  error: { message: string } | null;
};
type OperationalEventCountQuery = PromiseLike<OperationalEventCountResult> & {
  eq: (column: string, value: string) => OperationalEventCountQuery;
  gte: (column: string, value: string) => OperationalEventCountQuery;
  lt: (column: string, value: string) => OperationalEventCountQuery;
};
type OperationalEventCountClient = {
  from: (table: "operational_events") => {
    select: (
      columns: string,
      options: { count: "exact"; head: true },
    ) => OperationalEventCountQuery;
  };
};

const MIN_PREVIOUS_EVENTS_FOR_DROP_ALERT = 20;
const VOLUME_DROP_RATIO = 0.25;
const OBSERVABILITY_ALERT_CODES = [
  "operational_event_pipeline_stalled",
  "operational_event_write_failure",
  "operational_event_volume_drop",
  "ai_expiration_cron_stalled",
] as const;

type SyncAlertInput = {
  supabase: ServerClient;
  shopId: string;
  active: boolean;
  code: (typeof OBSERVABILITY_ALERT_CODES)[number];
  level: AlertLevel;
  title: string;
  message: string;
  metadata: Json;
  existing?: ExistingAlertState;
};

async function syncAlert(input: SyncAlertInput): Promise<void> {
  const now = new Date().toISOString();
  const fingerprint = `observability::${input.code}`;

  if (!input.active) {
    const { error } = await input.supabase
      .from("assistant_notifications")
      .update({
        status: "resolved",
        resolved_at: now,
        updated_at: now,
      })
      .eq("shop_id", input.shopId)
      .eq("fingerprint", fingerprint)
      .neq("status", "resolved");

    if (error) throw new Error(error.message);
    return;
  }

  const preserveAcknowledgement = input.existing?.status === "acknowledged";
  const continuingIncident =
    input.existing?.status === "active" || preserveAcknowledgement;

  const { error } = await input.supabase.from("assistant_notifications").upsert(
    {
      shop_id: input.shopId,
      user_id: null,
      role: "owner",
      source: "observability",
      fingerprint,
      code: input.code,
      level: input.level,
      title: input.title,
      message: input.message,
      href: "/dashboard/operations/observability",
      entity_type: "shop",
      entity_id: input.shopId,
      status: preserveAcknowledgement ? "acknowledged" : "active",
      metadata: input.metadata,
      first_seen_at:
        continuingIncident && input.existing?.firstSeenAt
          ? input.existing.firstSeenAt
          : now,
      last_seen_at: now,
      resolved_at: null,
      updated_at: now,
    },
    { onConflict: "shop_id,fingerprint" },
  );

  if (error) throw new Error(error.message);
}

async function loadExistingAlertStates(input: {
  supabase: ServerClient;
  shopId: string;
}): Promise<Map<string, ExistingAlertState>> {
  const { data, error } = await input.supabase
    .from("assistant_notifications")
    .select("code, status, first_seen_at")
    .eq("shop_id", input.shopId)
    .eq("source", "observability")
    .in("code", [...OBSERVABILITY_ALERT_CODES]);

  if (error) throw new Error(error.message);

  return new Map(
    (data ?? []).map((row) => [
      row.code,
      {
        status: row.status,
        firstSeenAt: row.first_seen_at,
      },
    ]),
  );
}

async function countPrevious24hEvents(input: {
  supabase: ServerClient;
  shopId: string;
  now: Date;
  installed: boolean;
}): Promise<number> {
  if (!input.installed) return 0;

  const client = input.supabase as unknown as OperationalEventCountClient;
  const end = new Date(
    input.now.getTime() - 24 * 60 * 60 * 1000,
  ).toISOString();
  const start = new Date(
    input.now.getTime() - 48 * 60 * 60 * 1000,
  ).toISOString();
  const { count, error } = await client
    .from("operational_events")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", input.shopId)
    .gte("occurred_at", start)
    .lt("occurred_at", end);

  if (error) throw new Error(error.message);
  return Number.isFinite(count) ? Number(count) : 0;
}

export function hasOperationalEventVolumeDropped(input: {
  installed: boolean;
  recentBusinessWrites: number;
  eventsLast24h: number;
  eventsPrevious24h: number;
}): boolean {
  return (
    input.installed &&
    input.recentBusinessWrites > 0 &&
    input.eventsPrevious24h >= MIN_PREVIOUS_EVENTS_FOR_DROP_ALERT &&
    input.eventsLast24h <=
      Math.floor(input.eventsPrevious24h * VOLUME_DROP_RATIO)
  );
}

export type OperationalObservabilityAlertSummary = {
  shopId: string;
  installed: boolean;
  pipelineStatus: string;
  pipelineStalled: boolean;
  activeFailures: number;
  eventVolumeDropped: boolean;
  aiExpirationNeedsReview: boolean;
};

export async function syncOperationalObservabilityAlerts(input: {
  supabase: ServerClient;
  shopId: string;
  now?: Date;
}): Promise<OperationalObservabilityAlertSummary> {
  const now = input.now ?? new Date();
  const [operational, ai, existingAlerts] = await Promise.all([
    getOperationalObservability({
      supabase: input.supabase,
      shopId: input.shopId,
      now,
      limit: 1,
    }),
    getAiOperationsObservability({
      supabase: input.supabase,
      actorContext: {
        shopId: input.shopId,
        actorId: "internal-observability-health",
        role: "system",
        source: "system",
      },
      now,
    }),
    loadExistingAlertStates({
      supabase: input.supabase,
      shopId: input.shopId,
    }),
  ]);

  const eventsPrevious24h = await countPrevious24hEvents({
    supabase: input.supabase,
    shopId: input.shopId,
    now,
    installed: operational.installed,
  });
  const pipelineStalled =
    operational.installed && operational.pipeline.status === "stalled";
  const activeFailures = operational.installed
    ? operational.pipeline.unresolvedFailures
    : 0;
  const eventVolumeDropped = hasOperationalEventVolumeDropped({
    installed: operational.installed,
    recentBusinessWrites: operational.pipeline.recentBusinessWrites,
    eventsLast24h: operational.pipeline.eventsLast24h,
    eventsPrevious24h,
  });
  const aiExpirationNeedsReview = ai.health.cronProbablyRunning === false;

  if (operational.installed) {
    await Promise.all([
      syncAlert({
        supabase: input.supabase,
        shopId: input.shopId,
        active: pipelineStalled,
        code: "operational_event_pipeline_stalled",
        level: "critical",
        title: "Operational event pipeline may be stalled",
        message: pipelineStalled
          ? `${operational.pipeline.recentBusinessWrites} recent work-order writes were found, but the canonical event stream has not reported recent activity.`
          : "Operational event activity has recovered.",
        metadata: {
          pipeline_status: operational.pipeline.status,
          last_event_at: operational.pipeline.lastEventAt,
          recent_business_writes: operational.pipeline.recentBusinessWrites,
        },
        existing: existingAlerts.get("operational_event_pipeline_stalled"),
      }),
      syncAlert({
        supabase: input.supabase,
        shopId: input.shopId,
        active: activeFailures > 0,
        code: "operational_event_write_failure",
        level: "critical",
        title: "Operational event logging needs attention",
        message:
          activeFailures > 0
            ? `ProFixIQ preserved the business actions, but ${activeFailures} operational event failure${activeFailures === 1 ? "" : "s"} require review.`
            : "Operational event failures have been resolved.",
        metadata: {
          failure_count: activeFailures,
          failures_last_24h: operational.pipeline.failuresLast24h,
        },
        existing: existingAlerts.get("operational_event_write_failure"),
      }),
      syncAlert({
        supabase: input.supabase,
        shopId: input.shopId,
        active: eventVolumeDropped,
        code: "operational_event_volume_drop",
        level: "warning",
        title: "Operational event volume dropped",
        message: eventVolumeDropped
          ? `Canonical event volume fell from ${eventsPrevious24h} to ${operational.pipeline.eventsLast24h} while shop records continued changing.`
          : "Operational event volume is within the expected range.",
        metadata: {
          events_last_24h: operational.pipeline.eventsLast24h,
          events_previous_24h: eventsPrevious24h,
          recent_business_writes: operational.pipeline.recentBusinessWrites,
        },
        existing: existingAlerts.get("operational_event_volume_drop"),
      }),
    ]);
  }

  await syncAlert({
    supabase: input.supabase,
    shopId: input.shopId,
    active: aiExpirationNeedsReview,
    code: "ai_expiration_cron_stalled",
    level: "warning",
    title: "AI expiration processing needs review",
    message: aiExpirationNeedsReview
      ? "Stale AI recommendations or approvals exist without recent expiration activity."
      : "AI expiration processing is reporting healthy activity.",
    metadata: {
      cron_probably_running: ai.health.cronProbablyRunning,
      stale_backlog: ai.health.hasStaleBacklog,
      pending_approval_backlog: ai.health.hasPendingApprovalBacklog,
      last_expiration_event_at: ai.expiration.lastExpirationEventAt,
    },
    existing: existingAlerts.get("ai_expiration_cron_stalled"),
  });

  return {
    shopId: input.shopId,
    installed: operational.installed,
    pipelineStatus: operational.pipeline.status,
    pipelineStalled,
    activeFailures,
    eventVolumeDropped,
    aiExpirationNeedsReview,
  };
}
