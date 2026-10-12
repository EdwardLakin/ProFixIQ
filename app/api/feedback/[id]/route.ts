import { NextRequest, NextResponse } from "next/server";

import type { Json } from "@shared/types/types/supabase";
import {
  FEEDBACK_STATUSES,
  isRecord,
  legacyStatusForFeedback,
  readFeedbackMetadata,
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

function rowContext(row: AgentRequestRow): Record<string, unknown> {
  return isRecord(row.normalized_json) ? row.normalized_json : {};
}

function normalizeStatus(value: unknown): FeedbackStatus | null {
  return typeof value === "string" &&
      FEEDBACK_STATUSES.includes(value as FeedbackStatus)
    ? (value as FeedbackStatus)
    : null;
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

  // Owner authorization is checked above. Use the admin client for the actual
  // feedback control operation so clusters spanning multiple tenant shops are
  // managed as one product-feedback item rather than being truncated by RLS.
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

  const metadata = readFeedbackMetadata(canonical.normalized_json);
  const currentStatus: FeedbackStatus = metadata?.status ?? "new";
  const nextStatus = normalizeStatus(body.status) ?? currentStatus;
  const now = new Date().toISOString();
  const nextMetadata = {
    version: 1 as const,
    clusterId: id,
    isCanonical: true,
    status: nextStatus,
    kind:
      metadata?.kind ??
      (canonical.intent === "bug_report"
        ? ("bug" as const)
        : ("feature_request" as const)),
    surface: metadata?.surface ?? ("other" as const),
    title: metadata?.title ?? canonical.description.slice(0, 100),
    summary: metadata?.summary ?? canonical.description,
    severity: metadata?.severity ?? ("normal" as const),
    needsAttention:
      typeof body.needsAttention === "boolean"
        ? body.needsAttention
        : (metadata?.needsAttention ?? false),
    recommendation:
      metadata?.recommendation ??
      canonical.llm_notes ??
      "Review alongside similar feedback.",
    aiMode: metadata?.aiMode ?? ("fallback" as const),
    aiModel: metadata?.aiModel ?? canonical.llm_model,
    duplicateConfidence: metadata?.duplicateConfidence ?? null,
    internalNotes:
      body.internalNotes === undefined
        ? (metadata?.internalNotes ?? null)
        : body.internalNotes?.trim() || null,
    firstSeenAt: metadata?.firstSeenAt ?? canonical.created_at,
    lastSeenAt: metadata?.lastSeenAt ?? canonical.updated_at,
    ownerNotifiedAt: metadata?.ownerNotifiedAt ?? null,
    completedAt:
      nextStatus === "completed" ? (metadata?.completedAt ?? now) : null,
    requesterNotifiedAt: metadata?.requesterNotifiedAt ?? null,
  };

  // Two persisted sources of truth (legacy row status and canonical metadata)
  // are updated together: if the second write fails, restore the first.
  const nextLegacyStatus = legacyStatusForFeedback(nextStatus);
  const { error: statusError } = await admin
    .from("agent_requests")
    .update({ status: nextLegacyStatus })
    .in("id", group.map((row) => row.id));
  if (statusError) {
    console.error("feedback group status update failed", statusError);
    return NextResponse.json(
      { error: "Failed to update feedback status" },
      { status: 500 },
    );
  }

  // Guard on requesterNotifiedAt so a concurrent request's notification claim
  // is never overwritten by this request's stale copy of the metadata.
  const canonicalUpdate = admin
    .from("agent_requests")
    .update({
      normalized_json: {
        ...rowContext(canonical),
        feedback: nextMetadata,
      } as Json,
      updated_at: now,
    })
    .eq("id", canonical.id);
  const { data: updatedCanonical, error: canonicalError } = await (
    nextMetadata.requesterNotifiedAt
      ? canonicalUpdate.eq(
          "normalized_json->feedback->>requesterNotifiedAt",
          nextMetadata.requesterNotifiedAt,
        )
      : canonicalUpdate.is("normalized_json->feedback->>requesterNotifiedAt", null)
  )
    .select("*")
    .maybeSingle();
  if (canonicalError || !updatedCanonical) {
    console.error("feedback canonical update failed", canonicalError);
    const byStatus = new Map<string, string[]>();
    for (const row of group) {
      byStatus.set(row.status, [...(byStatus.get(row.status) ?? []), row.id]);
    }
    for (const [status, ids] of byStatus) {
      const { error: rollbackError } = await admin
        .from("agent_requests")
        .update({ status })
        .in("id", ids);
      if (rollbackError) {
        console.error("feedback status rollback failed", rollbackError);
      }
    }
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
  if (
    nextStatus === "completed" &&
    body.notifyRequesters === true &&
    !nextMetadata.requesterNotifiedAt
  ) {
    // Atomic claim: only the request that flips requesterNotifiedAt from unset
    // to a claim timestamp may send. Concurrent requests match zero rows.
    const claimedAt = new Date().toISOString();
    const { data: claimed, error: claimError } = await admin
      .from("agent_requests")
      .update({
        normalized_json: {
          ...rowContext(updatedCanonical as AgentRequestRow),
          feedback: { ...nextMetadata, requesterNotifiedAt: claimedAt },
        } as Json,
      })
      .eq("id", canonical.id)
      .is("normalized_json->feedback->>requesterNotifiedAt", null)
      .select("id")
      .maybeSingle();
    if (claimError) {
      console.error("feedback requester notification claim failed", claimError);
    }

    if (claimed) {
      notified = await sendFeedbackCompletedEmails({
        reporterIds: group
          .map((row) => row.reporter_id)
          .filter((value): value is string => Boolean(value)),
        title: nextMetadata.title,
        summary: nextMetadata.summary,
      });

      if (notified === 0) {
        // Nothing was delivered: release the claim so a retry can send.
        const { error: releaseError } = await admin
          .from("agent_requests")
          .update({
            normalized_json: {
              ...rowContext(updatedCanonical as AgentRequestRow),
              feedback: { ...nextMetadata, requesterNotifiedAt: null },
            } as Json,
          })
          .eq("id", canonical.id);
        if (releaseError) {
          console.error("feedback notification claim release failed", releaseError);
        }
      }
    }
  }

  return NextResponse.json({ ok: true, status: nextStatus, notified });
}
