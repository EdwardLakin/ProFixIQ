import { NextRequest, NextResponse } from "next/server";

import type { Json } from "@shared/types/types/supabase";
import {
  FEEDBACK_KINDS,
  feedbackKindToAgentIntent,
  feedbackStatusFromLegacy,
  inferFeedbackSurface,
  isRecord,
  readFeedbackMetadata,
  notificationCounts,
  type FeedbackKind,
  type FeedbackMetadata,
} from "@/features/feedback/lib/feedback";
import { deliverFeedbackNotifications } from "@/features/feedback/server/delivery";
import {
  triageFeedback,
  type FeedbackCandidate,
} from "@/features/feedback/server/triageFeedback";
import {
  fetchAllLedgerRows,
  type AgentRequestRow,
  reporterAuthId,
} from "@/features/feedback/server/ledger";
import { requireOpsOperatorApiAccess } from "@/features/ops/server/operator-access";
import {
  PortalAccessError,
  requirePortalCustomerAccess,
} from "@/features/portal/server/portalAuth";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";

const MAX_DESCRIPTION_LENGTH = 12_000;
const MAX_CONTEXT_LENGTH = 4_000;
const MAX_LOCATION_LENGTH = 500;
const MAX_DEVICE_LENGTH = 1_000;
const MAX_ATTACHMENTS = 20;
const MAX_ATTACHMENT_PATH_LENGTH = 500;

type FeedbackContext = {
  location: string | null;
  pathname: string | null;
  steps: string | null;
  expected: string | null;
  actual: string | null;
  device: string | null;
  attachmentIds: string[];
  submissionKey: string | null;
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
  submissionKey?: string;
};

type ReporterIdentity = {
  id: string;
  profileId: string | null;
  shopId: string | null;
  role: string | null;
};

function boundedText(value: unknown, maxLength: number): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, maxLength) : null;
}

function normalizeKind(value: unknown): FeedbackKind {
  return typeof value === "string" &&
    FEEDBACK_KINDS.includes(value as FeedbackKind)
    ? (value as FeedbackKind)
    : "other";
}

function contextFromBody(body: CreateFeedbackBody): FeedbackContext {
  const attachmentIds = Array.isArray(body.attachmentIds)
    ? [
        ...new Set(
          body.attachmentIds
            .filter((value): value is string => typeof value === "string")
            .map((value) => value.trim())
            .filter(Boolean),
        ),
      ]
        .slice(0, MAX_ATTACHMENTS)
        .map((value) => value.slice(0, MAX_ATTACHMENT_PATH_LENGTH))
    : [];

  return {
    location: boundedText(body.location, MAX_LOCATION_LENGTH),
    pathname: boundedText(body.pathname, MAX_LOCATION_LENGTH),
    steps: boundedText(body.steps, MAX_CONTEXT_LENGTH),
    expected: boundedText(body.expected, MAX_CONTEXT_LENGTH),
    actual: boundedText(body.actual, MAX_CONTEXT_LENGTH),
    device: boundedText(body.device, MAX_DEVICE_LENGTH),
    attachmentIds,
    submissionKey: boundedText(body.submissionKey, 100),
  };
}

function clusterIdFor(row: AgentRequestRow): string {
  return readFeedbackMetadata(row.normalized_json)?.clusterId ?? row.id;
}

function rowContext(row: AgentRequestRow): Record<string, unknown> {
  return isRecord(row.normalized_json) ? row.normalized_json : {};
}

function isTerminalRow(row: AgentRequestRow): boolean {
  const metadata = readFeedbackMetadata(row.normalized_json);
  const legacyStatus = feedbackStatusFromLegacy(row.status);
  return (
    metadata?.status === "completed" ||
    metadata?.status === "declined" ||
    legacyStatus === "completed" ||
    legacyStatus === "declined"
  );
}

function fallbackCandidate(row: AgentRequestRow): FeedbackCandidate {
  const metadata = readFeedbackMetadata(row.normalized_json);
  const kind: FeedbackKind =
    metadata?.kind ?? (row.intent === "bug_report" ? "bug" : "feature_request");
  return {
    id: metadata?.clusterId ?? row.id,
    title: metadata?.title ?? row.description.slice(0, 100),
    summary: metadata?.summary ?? row.description.slice(0, 400),
    kind,
    surface:
      metadata?.surface ??
      inferFeedbackSurface(
        isRecord(row.normalized_json) &&
          typeof row.normalized_json.location === "string"
          ? row.normalized_json.location
          : null,
      ),
    submissionCount: 1,
  };
}

function buildCandidates(rows: AgentRequestRow[]): FeedbackCandidate[] {
  const grouped = new Map<string, FeedbackCandidate>();
  for (const row of rows) {
    // Completed and declined work must not silently absorb new customer demand.
    if (isTerminalRow(row)) continue;
    const candidate = fallbackCandidate(row);
    const existing = grouped.get(candidate.id);
    if (existing) {
      existing.submissionCount += 1;
      continue;
    }
    grouped.set(candidate.id, candidate);
  }
  return [...grouped.values()]
    .sort((left, right) => right.submissionCount - left.submissionCount)
    .slice(0, 18);
}

async function resolveReporterIdentity(
  supabase: ReturnType<typeof createServerSupabaseRoute>,
  user: { id: string; email?: string | null },
): Promise<ReporterIdentity | NextResponse> {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, shop_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("feedback profile lookup failed", profileError);
    return NextResponse.json(
      { error: "Could not resolve feedback identity" },
      { status: 500 },
    );
  }

  if (profile) {
    return {
      id: user.id,
      profileId: profile.id,
      shopId: profile.shop_id,
      role: profile.role,
    };
  }

  const email = user.email?.trim().toLowerCase() ?? "";
  if (!email) {
    return NextResponse.json(
      { error: "Feedback identity not found" },
      { status: 403 },
    );
  }

  try {
    const portal = await requirePortalCustomerAccess(user.id, email);
    return {
      id: user.id,
      profileId: null,
      shopId: portal.customer.shop_id,
      role: "customer",
    };
  } catch (error) {
    if (error instanceof PortalAccessError) {
      return NextResponse.json(
        { error: "Feedback identity not found" },
        { status: error.status },
      );
    }
    console.error("feedback portal identity lookup failed", error);
    return NextResponse.json(
      { error: "Could not resolve feedback identity" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req
    .json()
    .catch(() => null)) as CreateFeedbackBody | null;
  const description =
    typeof body?.description === "string" ? body.description.trim() : "";
  if (!description) {
    return NextResponse.json(
      { error: "description is required" },
      { status: 400 },
    );
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return NextResponse.json(
      {
        error: `description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer`,
      },
      { status: 400 },
    );
  }

  const identity = await resolveReporterIdentity(supabase, user);
  if (identity instanceof NextResponse) return identity;

  const requestedKind = normalizeKind(body?.kind);
  const context = contextFromBody(body ?? {});
  const admin = createAdminSupabase();

  if (
    !context.submissionKey ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(context.submissionKey)
  ) {
    return NextResponse.json(
      { error: "A valid submissionKey is required" },
      { status: 400 },
    );
  }
  if (
    context.attachmentIds.some(
      (path) =>
        !path.startsWith(`${user.id}/`) ||
        path.split("/").some((segment) => segment === ".." || segment === "."),
    )
  ) {
    return NextResponse.json(
      { error: "Invalid screenshot owner" },
      { status: 400 },
    );
  }
  const readiness = await admin.rpc("feedback_ready");
  if (readiness.error || readiness.data !== true) {
    return NextResponse.json(
      { error: "Feedback is temporarily unavailable" },
      { status: 503 },
    );
  }

  const { data: replay, error: replayError } = await admin
    .from("agent_requests")
    .select("*")
    .or(
      `normalized_json->>reporterAuthId.eq.${user.id},reporter_id.eq.${user.id}`,
    )
    .eq("normalized_json->>submissionKey", context.submissionKey)
    .maybeSingle();
  if (replayError)
    return NextResponse.json(
      { error: "Could not check feedback receipt" },
      { status: 503 },
    );
  if (replay) {
    // The receipt and all aggregate/notification work were committed atomically.
    const clusterId = clusterIdFor(replay);
    await deliverFeedbackNotifications(admin, clusterId, { owner: true });
    return NextResponse.json({
      ok: true,
      submissionId: replay.id,
      matchedExisting: clusterId !== replay.id,
      replayed: true,
    });
  }

  const { data: recentRows, error: recentError } = await admin
    .from("agent_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(750);
  if (recentError) {
    console.warn("feedback duplicate candidate lookup failed", recentError);
  }

  const rows = (recentRows ?? []) as AgentRequestRow[];
  const triage = await triageFeedback({
    description,
    requestedKind,
    pathname: context.pathname ?? context.location,
    role: identity.role,
    candidates: buildCandidates(rows),
    shopId: identity.shopId,
    userId: identity.id,
  });

  const now = new Date().toISOString();
  const duplicateId = triage.output.duplicateOf;
  const initialFeedback: FeedbackMetadata = {
    version: 1,
    clusterId: duplicateId,
    isCanonical: duplicateId === null,
    status: "new",
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
    ownerNotificationKeys: [],
    ownerNotificationClaimKeys: [],
    completedAt: null,
    requesterNotifiedAt: null,
    requesterNotifiedReporterIds: [],
    requesterNotificationSkippedReporterIds: [],
    requesterNotificationClaimedReporterIds: [],
  };

  const { data, error } = await admin.rpc("submit_feedback", {
    p_submission: {
      reporterAuthId: identity.id,
      profileId: identity.profileId,
      shopId: identity.shopId,
      role: identity.role,
      description,
      intent: feedbackKindToAgentIntent(triage.output.kind),
      submissionKey: context.submissionKey,
      context,
      feedback: initialFeedback,
    } as Json,
  });
  const receipt: unknown = data;
  if (
    error ||
    !isRecord(receipt) ||
    typeof receipt.clusterId !== "string" ||
    typeof receipt.submissionId !== "string" ||
    typeof receipt.replayed !== "boolean"
  ) {
    console.error("feedback transaction failed", error);
    return NextResponse.json(
      { error: "Failed to save feedback" },
      { status: 503 },
    );
  }
  await deliverFeedbackNotifications(admin, receipt.clusterId, { owner: true });
  return NextResponse.json({
    ok: true,
    submissionId: receipt.submissionId,
    matchedExisting: receipt.clusterId !== receipt.submissionId,
    replayed: receipt.replayed,
  });
}

export async function GET() {
  const access = await requireOpsOperatorApiAccess();
  if (!access.ok) return access.response;

  const { rows, error } = await fetchAllLedgerRows(createAdminSupabase());
  if (error) {
    console.error("feedback ops load failed", error);
    return NextResponse.json(
      { error: "Failed to load feedback" },
      { status: 500 },
    );
  }

  const groups = new Map<string, AgentRequestRow[]>();
  for (const row of rows) {
    const clusterId = clusterIdFor(row);
    const group = groups.get(clusterId) ?? [];
    group.push(row);
    groups.set(clusterId, group);
  }

  const items = [...groups.entries()].map(([id, submissions]) => {
    const canonical =
      submissions.find((row) => row.id === id) ??
      submissions[submissions.length - 1];
    const meta = readFeedbackMetadata(canonical.normalized_json);
    const sorted = [...submissions].sort(
      (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
    );
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const kind =
      meta?.kind ??
      (canonical.intent === "bug_report" ? "bug" : "feature_request");
    const context = rowContext(canonical);

    return {
      id,
      title: meta?.title ?? canonical.description.slice(0, 100),
      summary: meta?.summary ?? canonical.description,
      kind,
      surface:
        meta?.surface ??
        inferFeedbackSurface(
          typeof context.location === "string" ? context.location : null,
        ),
      status: meta?.status ?? feedbackStatusFromLegacy(canonical.status),
      severity: meta?.severity ?? "normal",
      needsAttention: meta?.needsAttention ?? canonical.status === "failed",
      recommendation:
        meta?.recommendation ??
        canonical.llm_notes ??
        "Review and classify this historical request.",
      internalNotes: meta?.internalNotes ?? null,
      aiMode: meta?.aiMode ?? "fallback",
      submissionCount: submissions.length,
      uniqueUserCount: new Set(submissions.map(reporterAuthId).filter(Boolean))
        .size,
      uniqueShopCount: new Set(
        submissions.map((row) => row.shop_id).filter(Boolean),
      ).size,
      firstSeenAt: meta?.firstSeenAt ?? first.created_at,
      lastSeenAt: meta?.lastSeenAt ?? last.created_at,
      completedAt: meta?.completedAt ?? null,
      updatedAt: canonical.updated_at,
      requesterNotifications: notificationCounts(
        submissions
          .map(reporterAuthId)
          .filter((id): id is string => Boolean(id)),
        meta?.requesterNotifiedReporterIds ?? [],
        meta?.requesterNotificationSkippedReporterIds ?? [],
        meta?.requesterNotificationClaims ?? {},
      ),
      ownerNotifications: notificationCounts(
        meta?.ownerPendingNotificationKeys ?? [],
        meta?.ownerNotificationKeys ?? [],
        [],
        meta?.ownerNotificationClaims ?? {},
      ),
      submissions: sorted.map((row) => ({
        id: row.id,
        description: row.description,
        reporterId: reporterAuthId(row),
        reporterRole: row.reporter_role,
        shopId: row.shop_id,
        createdAt: row.created_at,
        context: rowContext(row),
      })),
    };
  });

  items.sort((a, b) => {
    if (a.needsAttention !== b.needsAttention) {
      return a.needsAttention ? -1 : 1;
    }
    if (a.submissionCount !== b.submissionCount) {
      return b.submissionCount - a.submissionCount;
    }
    return Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt);
  });

  return NextResponse.json({ items });
}
