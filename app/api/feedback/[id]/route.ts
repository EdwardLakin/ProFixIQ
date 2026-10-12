import { NextRequest, NextResponse } from "next/server";

import type { Json } from "@shared/types/types/supabase";
import {
  FEEDBACK_STATUSES,
  feedbackStatusFromLegacy,
  isRecord,
  legacyStatusForFeedback,
  readFeedbackMetadata,
  type FeedbackMetadata,
  type FeedbackStatus,
} from "@/features/feedback/lib/feedback";
import { sendFeedbackCompletedEmails } from "@/features/feedback/server/notifications";
import {
  fetchClusterRows,
  type AgentRequestRow,
} from "@/features/feedback/server/ledger";
import { requireOpsOperatorApiAccess } from "@/features/ops/server/operator-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type UpdateFeedbackBody = {
  status?: string;
  needsAttention?: boolean;
  internalNotes?: string | null;
  notifyRequesters?: boolean;
};

type StatusWrite = {
  id: string;
  updated_at: string;
};

type RequesterSettlement = "delivered" | "skipped" | "release";

function rowContext(row: AgentRequestRow): Record<string, unknown> {
  return isRecord(row.normalized_json) ? row.normalized_json : {};
}

function normalizeStatus(value: unknown): FeedbackStatus | null {
  return typeof value === "string" &&
      FEEDBACK_STATUSES.includes(value as FeedbackStatus)
    ? (value as FeedbackStatus)
    : null;
}

function fallbackMetadata(
  canonical: AgentRequestRow,
  status: FeedbackStatus,
): FeedbackMetadata {
  return {
    version: 1,
    clusterId: canonical.id,
    isCanonical: true,
    status,
    kind: canonical.intent === "bug_report" ? "bug" : "feature_request",
    surface: "other",
    title: canonical.description.slice(0, 100),
    summary: canonical.description,
    severity: "normal",
    needsAttention: canonical.status === "failed",
    recommendation:
      canonical.llm_notes ?? "Review alongside similar feedback.",
    aiMode: "fallback",
    aiModel: canonical.llm_model,
    duplicateConfidence: null,
    internalNotes: null,
    firstSeenAt: canonical.created_at,
    lastSeenAt: canonical.updated_at,
    ownerNotifiedAt: null,
    ownerNotificationKeys: [],
    ownerNotificationClaimKeys: [],
    completedAt: status === "completed" ? canonical.updated_at : null,
    requesterNotifiedAt: null,
    requesterNotifiedReporterIds: [],
    requesterNotificationSkippedReporterIds: [],
    requesterNotificationClaimedReporterIds: [],
  };
}

async function rollbackLegacyStatuses(
  admin: ReturnType<typeof createAdminSupabase>,
  group: AgentRequestRow[],
  writes: StatusWrite[],
  nextLegacyStatus: string,
): Promise<void> {
  const originalStatus = new Map(group.map((row) => [row.id, row.status]));
  for (const write of writes) {
    const status = originalStatus.get(write.id);
    if (!status) continue;
    const { error } = await admin
      .from("agent_requests")
      .update({ status })
      .eq("id", write.id)
      .eq("status", nextLegacyStatus)
      .eq("updated_at", write.updated_at);
    if (error) console.error("feedback status rollback failed", error);
  }
}

async function claimRequesterNotification(
  admin: ReturnType<typeof createAdminSupabase>,
  canonicalId: string,
  reporterId: string,
): Promise<boolean> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await admin
      .from("agent_requests")
      .select("*")
      .eq("id", canonicalId)
      .maybeSingle();
    if (error || !data) {
      console.error("feedback requester claim reload failed", error);
      return false;
    }

    const row = data as AgentRequestRow;
    const metadata = readFeedbackMetadata(row.normalized_json);
    if (!metadata) return false;

    const delivered = new Set(metadata.requesterNotifiedReporterIds ?? []);
    const skipped = new Set(
      metadata.requesterNotificationSkippedReporterIds ?? [],
    );
    const claimed = new Set(
      metadata.requesterNotificationClaimedReporterIds ?? [],
    );
    if (
      delivered.has(reporterId) ||
      skipped.has(reporterId) ||
      claimed.has(reporterId)
    ) {
      return false;
    }

    claimed.add(reporterId);
    const updatedAt = new Date().toISOString();
    const { data: updated, error: updateError } = await admin
      .from("agent_requests")
      .update({
        normalized_json: {
          ...rowContext(row),
          feedback: {
            ...metadata,
            requesterNotificationClaimedReporterIds: [...claimed],
          },
        } as Json,
        updated_at: updatedAt,
      })
      .eq("id", canonicalId)
      .eq("updated_at", row.updated_at)
      .select("id")
      .maybeSingle();
    if (updateError) {
      console.error("feedback requester notification claim failed", updateError);
      return false;
    }
    if (updated) return true;
  }
  return false;
}

async function settleRequesterNotification(
  admin: ReturnType<typeof createAdminSupabase>,
  canonicalId: string,
  reporterId: string,
  settlement: RequesterSettlement,
): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await admin
      .from("agent_requests")
      .select("*")
      .eq("id", canonicalId)
      .maybeSingle();
    if (error || !data) {
      console.error("feedback requester settlement reload failed", error);
      return;
    }

    const row = data as AgentRequestRow;
    const metadata = readFeedbackMetadata(row.normalized_json);
    if (!metadata) return;

    const delivered = new Set(metadata.requesterNotifiedReporterIds ?? []);
    const skipped = new Set(
      metadata.requesterNotificationSkippedReporterIds ?? [],
    );
    const claimed = new Set(
      metadata.requesterNotificationClaimedReporterIds ?? [],
    );
    claimed.delete(reporterId);
    if (settlement === "delivered") delivered.add(reporterId);
    if (settlement === "skipped") skipped.add(reporterId);

    const updatedAt = new Date().toISOString();
    const { data: updated, error: updateError } = await admin
      .from("agent_requests")
      .update({
        normalized_json: {
          ...rowContext(row),
          feedback: {
            ...metadata,
            requesterNotifiedAt:
              settlement === "delivered"
                ? updatedAt
                : metadata.requesterNotifiedAt ?? null,
            requesterNotifiedReporterIds: [...delivered],
            requesterNotificationSkippedReporterIds: [...skipped],
            requesterNotificationClaimedReporterIds: [...claimed],
          },
        } as Json,
        updated_at: updatedAt,
      })
      .eq("id", canonicalId)
      .eq("updated_at", row.updated_at)
      .select("id")
      .maybeSingle();
    if (updateError) {
      console.error("feedback requester notification settlement failed", updateError);
      return;
    }
    if (updated) return;
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireOpsOperatorApiAccess();
  if (!access.ok) return access.response;

  const admin = createAdminSupabase();
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as UpdateFeedbackBody | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { rows: group, error } = await fetchClusterRows(admin, id);
  if (error) {
    console.error("feedback group load failed", error);
    return NextResponse.json(
      { error: "Failed to load feedback group" },
      { status: 500 },
    );
  }

  const canonical = group.find((row) => row.id === id) ?? null;
  if (!canonical || group.length === 0) {
    return NextResponse.json(
      { error: "Feedback item not found" },
      { status: 404 },
    );
  }

  const originalMetadata = readFeedbackMetadata(canonical.normalized_json);
  const currentStatus: FeedbackStatus =
    originalMetadata?.status ?? feedbackStatusFromLegacy(canonical.status);
  const nextStatus = normalizeStatus(body.status) ?? currentStatus;
  const nextLegacyStatus = legacyStatusForFeedback(nextStatus);

  const { data: statusWrites, error: statusError } = await admin
    .from("agent_requests")
    .update({ status: nextLegacyStatus })
    .in("id", group.map((row) => row.id))
    .select("id, updated_at");
  if (statusError) {
    console.error("feedback group status update failed", statusError);
    return NextResponse.json(
      { error: "Failed to update feedback status" },
      { status: 500 },
    );
  }

  const writes = (statusWrites ?? []) as StatusWrite[];
  const { data: freshCanonical, error: refreshError } = await admin
    .from("agent_requests")
    .select("*")
    .eq("id", canonical.id)
    .maybeSingle();
  if (refreshError || !freshCanonical) {
    await rollbackLegacyStatuses(admin, group, writes, nextLegacyStatus);
    console.error("feedback canonical refresh failed", refreshError);
    return NextResponse.json(
      { error: "Failed to update feedback" },
      { status: 500 },
    );
  }

  const refreshed = freshCanonical as AgentRequestRow;
  const latestMetadata =
    readFeedbackMetadata(refreshed.normalized_json) ??
    originalMetadata ??
    fallbackMetadata(canonical, currentStatus);
  const now = new Date().toISOString();
  const nextMetadata: FeedbackMetadata = {
    ...latestMetadata,
    clusterId: id,
    isCanonical: true,
    status: nextStatus,
    needsAttention:
      typeof body.needsAttention === "boolean"
        ? body.needsAttention
        : latestMetadata.needsAttention,
    internalNotes:
      body.internalNotes === undefined
        ? (latestMetadata.internalNotes ?? null)
        : body.internalNotes?.trim() || null,
    completedAt:
      nextStatus === "completed" ? (latestMetadata.completedAt ?? now) : null,
  };

  const { data: updatedCanonical, error: canonicalError } = await admin
    .from("agent_requests")
    .update({
      normalized_json: {
        ...rowContext(refreshed),
        feedback: nextMetadata,
      } as Json,
      updated_at: now,
    })
    .eq("id", canonical.id)
    .eq("updated_at", refreshed.updated_at)
    .select("*")
    .maybeSingle();

  if (canonicalError || !updatedCanonical) {
    await rollbackLegacyStatuses(admin, group, writes, nextLegacyStatus);
    console.error("feedback canonical update failed", canonicalError);
    return NextResponse.json(
      {
        error: canonicalError
          ? "Failed to update feedback"
          : "Feedback changed concurrently; reload and retry",
      },
      { status: canonicalError ? 500 : 409 },
    );
  }

  let notified = 0;
  if (nextStatus === "completed" && body.notifyRequesters === true) {
    const reporterIds = [
      ...new Set(
        group
          .map((row) => row.reporter_id)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const claimedReporterIds: string[] = [];

    for (const reporterId of reporterIds) {
      if (await claimRequesterNotification(admin, canonical.id, reporterId)) {
        claimedReporterIds.push(reporterId);
      }
    }

    if (claimedReporterIds.length > 0) {
      const delivery = await sendFeedbackCompletedEmails({
        reporterIds: claimedReporterIds,
      });
      notified = delivery.deliveredReporterIds.length;

      const delivered = new Set(delivery.deliveredReporterIds);
      const unreachable = new Set(delivery.unreachableReporterIds);
      for (const reporterId of claimedReporterIds) {
        if (delivered.has(reporterId)) {
          // If receipt persistence fails, the durable claim is intentionally
          // retained. That prevents a retry from duplicating an email that was
          // already delivered externally.
          await settleRequesterNotification(
            admin,
            canonical.id,
            reporterId,
            "delivered",
          );
        } else if (unreachable.has(reporterId)) {
          await settleRequesterNotification(
            admin,
            canonical.id,
            reporterId,
            "skipped",
          );
        } else {
          // Transient delivery/lookup failure: release only this reporter so a
          // later Ops retry can attempt that recipient again.
          await settleRequesterNotification(
            admin,
            canonical.id,
            reporterId,
            "release",
          );
        }
      }
    }
  }

  return NextResponse.json({ ok: true, status: nextStatus, notified });
}
