import { NextRequest, NextResponse } from "next/server";

import type { Database, Json } from "@shared/types/types/supabase";
import {
  FEEDBACK_KINDS,
  feedbackKindToAgentIntent,
  feedbackStatusFromLegacy,
  inferFeedbackSurface,
  isRecord,
  readFeedbackMetadata,
  type FeedbackKind,
} from "@/features/feedback/lib/feedback";
import { sendFeedbackAttentionEmail } from "@/features/feedback/server/notifications";
import { triageFeedback, type FeedbackCandidate } from "@/features/feedback/server/triageFeedback";
import { requireOpsOperatorApiAccess } from "@/features/ops/server/operator-access";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";

type AgentRequestRow = Database["public"]["Tables"]["agent_requests"]["Row"];

type FeedbackContext = {
  location: string | null;
  pathname: string | null;
  steps: string | null;
  expected: string | null;
  actual: string | null;
  device: string | null;
  attachmentIds: string[];
};

type CreateFeedbackBody = {
  description?: string;
  kind?: string;
  pathname?: string;
  location?: string;
  steps?: string;
  expected?: string;
  actual?: string;
  device?: string;
  attachmentIds?: string[];
};

function nullableText(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function normalizeKind(value: unknown): FeedbackKind {
  return typeof value === "string" && FEEDBACK_KINDS.includes(value as FeedbackKind)
    ? (value as FeedbackKind)
    : "other";
}

function contextFromBody(body: CreateFeedbackBody): FeedbackContext {
  return {
    location: nullableText(body.location),
    pathname: nullableText(body.pathname),
    steps: nullableText(body.steps),
    expected: nullableText(body.expected),
    actual: nullableText(body.actual),
    device: nullableText(body.device),
    attachmentIds: Array.isArray(body.attachmentIds)
      ? body.attachmentIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [],
  };
}

function fallbackCandidate(row: AgentRequestRow): FeedbackCandidate {
  const metadata = readFeedbackMetadata(row.normalized_json);
  const kind: FeedbackKind = metadata?.kind ?? (row.intent === "bug_report" ? "bug" : "feature_request");
  return {
    id: metadata?.clusterId ?? row.id,
    title: metadata?.title ?? row.description.slice(0, 100),
    summary: metadata?.summary ?? row.description.slice(0, 400),
    kind,
    surface: metadata?.surface ?? inferFeedbackSurface(
      isRecord(row.normalized_json) && typeof row.normalized_json.location === "string"
        ? row.normalized_json.location
        : null,
    ),
    submissionCount: 1,
  };
}

function buildCandidates(rows: AgentRequestRow[]): FeedbackCandidate[] {
  const grouped = new Map<string, FeedbackCandidate>();
  for (const row of rows) {
    const candidate = fallbackCandidate(row);
    const existing = grouped.get(candidate.id);
    if (existing) {
      existing.submissionCount += 1;
      continue;
    }
    grouped.set(candidate.id, candidate);
  }
  return [...grouped.values()].slice(0, 18);
}

function clusterIdFor(row: AgentRequestRow): string {
  return readFeedbackMetadata(row.normalized_json)?.clusterId ?? row.id;
}

function rowContext(row: AgentRequestRow): Record<string, unknown> {
  return isRecord(row.normalized_json) ? row.normalized_json : {};
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as CreateFeedbackBody | null;
  const description = body?.description?.trim() ?? "";
  if (!description) {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, shop_id, role")
    .eq("id", user.id)
    .single();
  if (profileError || !profile) {
    console.error("feedback profile lookup failed", profileError);
    return NextResponse.json({ error: "Profile not found" }, { status: 400 });
  }

  const requestedKind = normalizeKind(body?.kind);
  const context = contextFromBody(body ?? {});
  const admin = createAdminSupabase();
  const { data: recentRows, error: recentError } = await admin
    .from("agent_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(160);
  if (recentError) console.warn("feedback duplicate candidate lookup failed", recentError);

  const rows = (recentRows ?? []) as AgentRequestRow[];
  const triage = await triageFeedback({
    description,
    requestedKind,
    pathname: context.pathname ?? context.location,
    role: profile.role,
    candidates: buildCandidates(rows),
    shopId: profile.shop_id,
    userId: profile.id,
  });

  const now = new Date().toISOString();
  const duplicateId = triage.output.duplicateOf;
  const initialFeedback = {
    version: 1 as const,
    clusterId: duplicateId,
    isCanonical: duplicateId === null,
    status: "new" as const,
    kind: triage.output.kind,
    surface: triage.output.surface,
    title: triage.output.title,
    summary: triage.output.summary,
    severity: triage.output.severity,
    needsAttention: triage.output.needsAttention,
    recommendation: triage.output.recommendation,
    aiMode: triage.mode,
    aiModel: triage.model,
    duplicateConfidence: triage.output.duplicateConfidence,
    firstSeenAt: now,
    lastSeenAt: now,
    ownerNotifiedAt: null,
    completedAt: null,
    requesterNotifiedAt: null,
  };

  const normalizedJson: Json = {
    ...context,
    feedback: initialFeedback,
  };

  const { data: inserted, error: insertError } = await admin
    .from("agent_requests")
    .insert({
      shop_id: profile.shop_id,
      reporter_id: profile.id,
      reporter_role: profile.role,
      description,
      intent: feedbackKindToAgentIntent(triage.output.kind),
      normalized_json: normalizedJson,
      status: "submitted",
      llm_model: triage.mode === "ai" ? triage.model : null,
      llm_confidence: triage.output.duplicateConfidence,
      llm_notes: `${triage.output.summary}\n\nRecommendation: ${triage.output.recommendation}`,
    })
    .select("*")
    .single();

  if (insertError || !inserted) {
    console.error("feedback insert failed", insertError);
    return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 });
  }

  const canonicalId = duplicateId ?? inserted.id;
  let canonicalRow = duplicateId ? rows.find((row) => row.id === duplicateId) ?? null : inserted;

  if (!duplicateId) {
    const selfMetadata = { ...initialFeedback, clusterId: inserted.id, isCanonical: true };
    const { data: updated, error } = await admin
      .from("agent_requests")
      .update({ normalized_json: { ...rowContext(inserted), feedback: selfMetadata } as Json })
      .eq("id", inserted.id)
      .select("*")
      .single();
    if (error) console.warn("feedback canonical self-link update failed", error);
    if (updated) canonicalRow = updated;
  } else if (canonicalRow) {
    const canonicalMeta = readFeedbackMetadata(canonicalRow.normalized_json);
    if (canonicalMeta) {
      const nextMeta = {
        ...canonicalMeta,
        lastSeenAt: now,
        needsAttention: canonicalMeta.needsAttention || triage.output.needsAttention,
        severity:
          triage.output.severity === "critical" ||
          (triage.output.severity === "high" && canonicalMeta.severity !== "critical")
            ? triage.output.severity
            : canonicalMeta.severity,
      };
      const { data: updated, error } = await admin
        .from("agent_requests")
        .update({ normalized_json: { ...rowContext(canonicalRow), feedback: nextMeta } as Json })
        .eq("id", canonicalId)
        .select("*")
        .single();
      if (error) console.warn("feedback canonical aggregate update failed", error);
      if (updated) canonicalRow = updated;
    }
  }

  const groupRows = [...rows.filter((row) => clusterIdFor(row) === canonicalId), inserted];
  const uniqueShops = new Set(groupRows.map((row) => row.shop_id).filter(Boolean));
  const canonicalMeta = canonicalRow ? readFeedbackMetadata(canonicalRow.normalized_json) : null;
  const shouldNotify =
    duplicateId === null ||
    triage.output.needsAttention ||
    uniqueShops.size >= 3 ||
    groupRows.length >= 5;

  if (shouldNotify && !canonicalMeta?.ownerNotifiedAt) {
    const delivered = await sendFeedbackAttentionEmail({
      title: triage.output.title,
      summary: triage.output.summary,
      surface: triage.output.surface,
      kind: triage.output.kind,
      severity: triage.output.severity,
      submissionCount: groupRows.length,
      uniqueShopCount: uniqueShops.size,
      recommendation: triage.output.recommendation,
      feedbackId: canonicalId,
    });
    if (delivered && canonicalRow) {
      const meta = readFeedbackMetadata(canonicalRow.normalized_json);
      if (meta) {
        await admin
          .from("agent_requests")
          .update({
            normalized_json: {
              ...rowContext(canonicalRow),
              feedback: { ...meta, ownerNotifiedAt: now },
            } as Json,
          })
          .eq("id", canonicalId);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    feedbackId: canonicalId,
    submissionId: inserted.id,
    matchedExisting: duplicateId !== null,
    triage: triage.output,
  });
}

export async function GET() {
  const access = await requireOpsOperatorApiAccess();
  if (!access.ok) return access.response;

  const { data, error } = await access.supabase
    .from("agent_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(750);
  if (error) {
    console.error("feedback ops load failed", error);
    return NextResponse.json({ error: "Failed to load feedback" }, { status: 500 });
  }

  const rows = (data ?? []) as AgentRequestRow[];
  const groups = new Map<string, AgentRequestRow[]>();
  for (const row of rows) {
    const clusterId = clusterIdFor(row);
    const group = groups.get(clusterId) ?? [];
    group.push(row);
    groups.set(clusterId, group);
  }

  const items = [...groups.entries()].map(([id, submissions]) => {
    const canonical = submissions.find((row) => row.id === id) ?? submissions[submissions.length - 1];
    const meta = readFeedbackMetadata(canonical.normalized_json);
    const sorted = [...submissions].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const kind = meta?.kind ?? (canonical.intent === "bug_report" ? "bug" : "feature_request");
    const context = rowContext(canonical);

    return {
      id,
      title: meta?.title ?? canonical.description.slice(0, 100),
      summary: meta?.summary ?? canonical.description,
      kind,
      surface: meta?.surface ?? inferFeedbackSurface(typeof context.location === "string" ? context.location : null),
      status: meta?.status ?? feedbackStatusFromLegacy(canonical.status),
      severity: meta?.severity ?? "normal",
      needsAttention: meta?.needsAttention ?? canonical.status === "failed",
      recommendation: meta?.recommendation ?? canonical.llm_notes ?? "Review and classify this historical request.",
      internalNotes: meta?.internalNotes ?? null,
      aiMode: meta?.aiMode ?? "fallback",
      submissionCount: submissions.length,
      uniqueUserCount: new Set(submissions.map((row) => row.reporter_id).filter(Boolean)).size,
      uniqueShopCount: new Set(submissions.map((row) => row.shop_id).filter(Boolean)).size,
      firstSeenAt: meta?.firstSeenAt ?? first.created_at,
      lastSeenAt: meta?.lastSeenAt ?? last.created_at,
      completedAt: meta?.completedAt ?? null,
      submissions: sorted.map((row) => ({
        id: row.id,
        description: row.description,
        reporterId: row.reporter_id,
        reporterRole: row.reporter_role,
        shopId: row.shop_id,
        createdAt: row.created_at,
        context: rowContext(row),
      })),
    };
  });

  items.sort((a, b) => {
    if (a.needsAttention !== b.needsAttention) return a.needsAttention ? -1 : 1;
    if (a.submissionCount !== b.submissionCount) return b.submissionCount - a.submissionCount;
    return Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt);
  });

  return NextResponse.json({ items });
}
