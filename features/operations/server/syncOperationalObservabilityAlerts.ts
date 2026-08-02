import "server-only";

import type { Database, Json } from "@shared/types/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAiOperationsObservability } from "@/features/ai/server";
import { getOperationalObservability } from "./getOperationalObservability";

type ServerClient = SupabaseClient<Database>;
type AlertLevel = "info" | "warning" | "critical";

const MIN_PREVIOUS_EVENTS_FOR_DROP_ALERT = 20;
const VOLUME_DROP_RATIO = 0.25;

type SyncAlertInput = {
  supabase: ServerClient;
  shopId: string;
  active: boolean;
  code: string;
  level: AlertLevel;
  title: string;
  message: string;
  metadata: Json;
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
      status: "active",
      metadata: input.metadata,
      last_seen_at: now,
      resolved_at: null,
      updated_at: now,
    },
    { onConflict: "shop_id,fingerprint" },
  );

  if (error) throw new Error(error.message);
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
  const [operational, ai] = await Promise.all([
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
  ]);

  const pipelineStalled =
    operational.installed && operational.pipeline.status === "stalled";
  const activeFailures = operational.installed
    ? operational.pipeline.unresolvedFailures
    : 0;
  const eventVolumeDropped =
    operational.installed &&
    operational.pipeline.recentBusinessWrites > 0 &&
    operational.pipeline.eventsPrevious24h >= MIN_PREVIOUS_EVENTS_FOR_DROP_ALERT &&
    operational.pipeline.eventsLast24h <=
      Math.floor(operational.pipeline.eventsPrevious24h * VOLUME_DROP_RATIO);
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
      }),
      syncAlert({
        supabase: input.supabase,
        shopId: input.shopId,
        active: eventVolumeDropped,
        code: "operational_event_volume_drop",
        level: "warning",
        title: "Operational event volume dropped",
        message: eventVolumeDropped
          ? `Canonical event volume fell from ${operational.pipeline.eventsPrevious24h} to ${operational.pipeline.eventsLast24h} while shop records continued changing.`
          : "Operational event volume is within the expected range.",
        metadata: {
          events_last_24h: operational.pipeline.eventsLast24h,
          events_previous_24h: operational.pipeline.eventsPrevious24h,
          recent_business_writes: operational.pipeline.recentBusinessWrites,
        },
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
