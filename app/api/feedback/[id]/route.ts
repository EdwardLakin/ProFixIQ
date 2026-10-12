import { NextRequest, NextResponse } from "next/server";

import type { Database, Json } from "@shared/types/types/supabase";
import {
  FEEDBACK_STATUSES,
  isRecord,
  legacyStatusForFeedback,
  readFeedbackMetadata,
  type FeedbackStatus,
} from "@/features/feedback/lib/feedback";
import { sendFeedbackCompletedEmails } from "@/features/feedback/server/notifications";
import { requireOpsOperatorApiAccess } from "@/features/ops/server/operator-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type AgentRequestRow = Database["public"]["Tables"]["agent_requests"]["Row"];

type UpdateFeedbackBody = {
  status?: string;
  needsAttention?: boolean;
  internalNotes?: string | null;
  notifyRequesters?: boolean;
};

function clusterIdFor(row: AgentRequestRow): string {
  return readFeedbackMetadata(row.normalized_json)?.clusterId ?? row.id;
}

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
  const { data, error } = await admin
    .from("agent_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1500);
  if (error) {
    console.error("feedback group load failed", error);
    return NextResponse.json(
      { error: "Failed to load feedback group" },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as AgentRequestRow[];
  const group = rows.filter((row) => clusterIdFor(row) === id);
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

  const ids = group.map((row) => row.id);
  const { error: statusError } = await admin
    .from("agent_requests")
    .update({ status: legacyStatusForFeedback(nextStatus) })
    .in("id", ids);
  if (statusError) {
    console.error("feedback group status update failed", statusError);
    return NextResponse.json(
      { error: "Failed to update feedback status" },
      { status: 500 },
    );
  }

  const { data: updatedCanonical, error: canonicalError } = await admin
    .from("agent_requests")
    .update({
      normalized_json: {
        ...rowContext(canonical),
        feedback: nextMetadata,
      } as Json,
      updated_at: now,
    })
    .eq("id", canonical.id)
    .select("*")
    .single();
  if (canonicalError || !updatedCanonical) {
    console.error("feedback canonical update failed", canonicalError);
    return NextResponse.json(
      { error: "Failed to update feedback" },
      { status: 500 },
    );
  }

  let notified = 0;
  if (
    nextStatus === "completed" &&
    body.notifyRequesters === true &&
    !nextMetadata.requesterNotifiedAt
  ) {
    notified = await sendFeedbackCompletedEmails({
      reporterIds: group
        .map((row) => row.reporter_id)
        .filter((value): value is string => Boolean(value)),
      title: nextMetadata.title,
      summary: nextMetadata.summary,
    });

    if (notified > 0) {
      const notifiedAt = new Date().toISOString();
      const { error: notificationUpdateError } = await admin
        .from("agent_requests")
        .update({
          normalized_json: {
            ...rowContext(updatedCanonical as AgentRequestRow),
            feedback: {
              ...nextMetadata,
              requesterNotifiedAt: notifiedAt,
            },
          } as Json,
        })
        .eq("id", canonical.id);
      if (notificationUpdateError) {
        console.error(
          "feedback requester notification state update failed",
          notificationUpdateError,
        );
      }
    }
  }

  return NextResponse.json({ ok: true, status: nextStatus, notified });
}
