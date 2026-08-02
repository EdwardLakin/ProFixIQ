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

const MIN_PREVIOUS_EVENTS_FOR_DROP_ALERT = 20;
const VOLUME_DROP_RATIO = 0.25;
const OBSERVABILITY_ALERT_CODES = [
  "operational_event_pipeline_stalled",
  "operational_event_write_failure",
  "operational_event_volume_drop",
  "ai_expiration_cron_stalled",
] as const;

export type OperationalHealthProjection = {
  shop_id: string;
  recent_business_writes: number | string | null;
  events_last_6h: number | string | null;
  events_last_24h: number | string | null;
  events_previous_24h: number | string | null;
  last_event_at: string | null;
  unresolved_failure_count: number | string | null;
  health_status: string | null;
};

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

function numeric(value: number | string | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

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
  operationalHealth?: OperationalHealthProjection;
}): Promise<OperationalObservabilityAlertSummary> {
  const now = input.now ?? new Date();
  const [operational, ai, existingAlerts] = await Promise.all([
    input.operationalHealth
      ? Promise.resolve(null)
      : getOperationalObservability({
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

  const installed = input.operationalHealth
    ? true
    : operational?.installed === true;
  const pipelineStatus =
    input.operationalHealth?.health_status ??
    operational?.pipeline.status ??
    "not_installed";
  const recentBusinessWrites = input.operationalHealth
    ? numeric(input.operationalHealth.recent_business_writes)
    : operational?.pipeline.recentBusinessWrites ?? 0;
  const eventsLast24h = input.operationalHealth
    ? numeric(input.operationalHealth.events_last_24h)
    : operational?.pipeline.eventsLast24h ?? 0;
  const eventsPrevious24h = input.operationalHealth
    ? numeric(input.operationalHealth.events_previous_24h)
    : operational?.pipeline.eventsPrevious24h ?? 0;
  const lastEventAt =
    input.operationalHealth?.last_event_at ??
    operational?.pipeline.lastEventAt ??
    null;
  const activeFailures = installed
    ? input.operationalHealth
      ? numeric(input.operationalHealth.unresolved_failure_count)
      : operational?.pipeline.unresolvedFailures ?? 0
    : 0;
  const failuresLast24h =
    operational?.pipeline.failuresLast24h ?? activeFailures;
  const pipelineStalled = installed && pipelineStatus === "stalled";
  const eventVolumeDropped = hasOperationalEventVolumeDropped({
    installed,
    recentBusinessWrites,
    eventsLast24h,
    eventsPrevious24h,
  });
  const aiExpirationNeedsReview = ai.health.cronProbablyRunning === false;

  if (installed) {
    await Promise.all([
      syncAlert({
        supabase: input.supabase,
        shopId: input.shopId,
        active: pipelineStalled,
        code: "operational_event_pipeline_stalled",
        level: "critical",
        title: "Operational event pipeline may be stalled",
        message: pipelineStalled
          ? `${recentBusinessWrites} recent work-order writes were found, but the canonical event stream has not reported recent activity.`
          : "Operational event activity has recovered.",
        metadata: {
          pipeline_status: pipelineStatus,
          last_event_at: lastEventAt,
          recent_business_writes: recentBusinessWrites,
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
          failures_last_24h: failuresLast24h,
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
          ? `Canonical event volume fell from ${eventsPrevious24h} to ${eventsLast24h} while shop records continued changing.`
          : "Operational event volume is within the expected range.",
        metadata: {
          events_last_24h: eventsLast24h,
          events_previous_24h: eventsPrevious24h,
          recent_business_writes: recentBusinessWrites,
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
    installed,
    pipelineStatus,
    pipelineStalled,
    activeFailures,
    eventVolumeDropped,
    aiExpirationNeedsReview,
  };
}
