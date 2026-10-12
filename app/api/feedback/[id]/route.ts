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
    kind:
      canonical.intent === "bug_report"
        ? "bug"
        : "feature_request",
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
    completedAt: status === "completed" ? canonical.updated_at : null,
    requesterNotifiedAt: null,
    requesterNotifiedReporterIds: [],
    requesterNotificationSkippedReporterIds: [],
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

  // First align the compatibility status rows, retaining the returned write
  // versions so a rollback cannot overwrite a newer concurrent edit.
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

  // Whole-row version CAS: duplicate aggregation and lifecycle edits both move
  // updated_at, so neither path can write a stale feedback document over the
  // other. The loser reloads/retries instead of silently reverting metadata.
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
    const currentRow = updatedCanonical as AgentRequestRow;
    const deliveryMetadata = readFeedbackMetadata(currentRow.normalized_json);
    if (deliveryMetadata && !deliveryMetadata.requesterNotifiedAt) {
      const deliveredBefore = new Set(
        deliveryMetadata.requesterNotifiedReporterIds ?? [],
      );
      const skippedBefore = new Set(
        deliveryMetadata.requesterNotificationSkippedReporterIds ?? [],
      );
      const pendingReporterIds = [...new Set(
        group
          .map((row) => row.reporter_id)
          .filter((value): value is string => Boolean(value)),
      )].filter(
        (reporterId) =>
          !deliveredBefore.has(reporterId) && !skippedBefore.has(reporterId),
      );

      if (pendingReporterIds.length > 0) {
        const claimedAt = new Date().toISOString();
        const { data: claimed, error: claimError } = await admin
          .from("agent_requests")
          .update({
            normalized_json: {
              ...rowContext(currentRow),
              feedback: {
                ...deliveryMetadata,
                requesterNotifiedAt: claimedAt,
              },
            } as Json,
            updated_at: claimedAt,
          })
          .eq("id", canonical.id)
          .eq("updated_at", currentRow.updated_at)
          .is("normalized_json->feedback->>requesterNotifiedAt", null)
          .select("*")
          .maybeSingle();
        if (claimError) {
          console.error("feedback requester notification claim failed", claimError);
        }

        if (claimed) {
          const delivery = await sendFeedbackCompletedEmails({
            reporterIds: pendingReporterIds,
            title: deliveryMetadata.title,
            summary: deliveryMetadata.summary,
          });
          notified = delivery.deliveredReporterIds.length;

          // Merge delivery receipts into whatever lifecycle metadata is newest.
          // If a lifecycle edit raced the send, reload and retry this metadata
          // merge rather than reverting the lifecycle fields.
          for (let attempt = 0; attempt < 5; attempt += 1) {
            const { data: latestRow, error: latestError } = await admin
              .from("agent_requests")
              .select("*")
              .eq("id", canonical.id)
              .maybeSingle();
            if (latestError || !latestRow) {
              console.error("feedback requester receipt reload failed", latestError);
              break;
            }
            const latest = latestRow as AgentRequestRow;
            const latestMeta = readFeedbackMetadata(latest.normalized_json);
            if (!latestMeta) break;
            const deliveredIds = [...new Set([
              ...(latestMeta.requesterNotifiedReporterIds ?? []),
              ...delivery.deliveredReporterIds,
            ])];
            const skippedIds = [...new Set([
              ...(latestMeta.requesterNotificationSkippedReporterIds ?? []),
              ...delivery.unreachableReporterIds,
            ])];
            const receiptUpdatedAt = new Date().toISOString();
            const { data: receiptRow, error: receiptError } = await admin
              .from("agent_requests")
              .update({
                normalized_json: {
                  ...rowContext(latest),
                  feedback: {
                    ...latestMeta,
                    requesterNotifiedAt:
                      delivery.retryReporterIds.length === 0 ? claimedAt : null,
                    requesterNotifiedReporterIds: deliveredIds,
                    requesterNotificationSkippedReporterIds: skippedIds,
                  },
                } as Json,
                updated_at: receiptUpdatedAt,
              })
              .eq("id", canonical.id)
              .eq("updated_at", latest.updated_at)
              .select("id")
              .maybeSingle();
            if (receiptError) {
              console.error("feedback requester receipt update failed", receiptError);
              break;
            }
            if (receiptRow) break;
          }
        }
      }
    }
  }

  return NextResponse.json({ ok: true, status: nextStatus, notified });
}
