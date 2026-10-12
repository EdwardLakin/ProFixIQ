import { NextRequest, NextResponse } from "next/server";

import type { Json } from "@shared/types/types/supabase";
import {
  FEEDBACK_KINDS,
  feedbackKindToAgentIntent,
  feedbackStatusFromLegacy,
  inferFeedbackSurface,
  isRecord,
  readFeedbackMetadata,
  type FeedbackKind,
  type FeedbackMetadata,
} from "@/features/feedback/lib/feedback";
import { sendFeedbackAttentionEmail } from "@/features/feedback/server/notifications";
import { triageFeedback, type FeedbackCandidate } from "@/features/feedback/server/triageFeedback";
import {
  fetchAllLedgerRows,
  fetchClusterRows,
  type AgentRequestRow,
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

const REPORT_MILESTONES = new Set([3, 5, 10, 25, 50, 100]);
const SHOP_MILESTONES = new Set([2, 3, 5, 10, 25, 50]);

const SEVERITY_RANK: Record<string, number> = {
  low: 0,
  normal: 1,
  high: 2,
  critical: 3,
};

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
  shopId: string | null;
  role: string | null;
};

function boundedText(value: unknown, maxLength: number): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, maxLength) : null;
}

function normalizeKind(value: unknown): FeedbackKind {
  return typeof value === "string" && FEEDBACK_KINDS.includes(value as FeedbackKind)
    ? (value as FeedbackKind)
    : "other";
}

function contextFromBody(body: CreateFeedbackBody): FeedbackContext {
  const attachmentIds = Array.isArray(body.attachmentIds)
    ? [...new Set(
        body.attachmentIds
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean),
      )]
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

function replayResponse(row: Pick<AgentRequestRow, "id" | "normalized_json">) {
  const existingMeta = readFeedbackMetadata(row.normalized_json);
  return NextResponse.json({
    ok: true,
    submissionId: row.id,
    matchedExisting: existingMeta ? existingMeta.clusterId !== row.id : false,
    replayed: true,
  });
}

async function findReplay(
  admin: ReturnType<typeof createAdminSupabase>,
  reporterId: string,
  submissionKey: string,
): Promise<Pick<AgentRequestRow, "id" | "normalized_json"> | null> {
  const { data, error } = await admin
    .from("agent_requests")
    .select("id, normalized_json")
    .eq("reporter_id", reporterId)
    .eq("normalized_json->>submissionKey", submissionKey)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("feedback replay lookup failed", error);
    return null;
  }
  return data as Pick<AgentRequestRow, "id" | "normalized_json"> | null;
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
    return NextResponse.json({ error: "Could not resolve feedback identity" }, { status: 500 });
  }

  if (profile) {
    return {
      id: profile.id,
      shopId: profile.shop_id,
      role: profile.role,
    };
  }

  const email = user.email?.trim().toLowerCase() ?? "";
  if (!email) {
    return NextResponse.json({ error: "Feedback identity not found" }, { status: 403 });
  }

  try {
    const portal = await requirePortalCustomerAccess(user.id, email);
    return {
      id: user.id,
      shopId: portal.customer.shop_id,
      role: "customer",
    };
  } catch (error) {
    if (error instanceof PortalAccessError) {
      return NextResponse.json({ error: "Feedback identity not found" }, { status: error.status });
    }
    console.error("feedback portal identity lookup failed", error);
    return NextResponse.json({ error: "Could not resolve feedback identity" }, { status: 500 });
  }
}

function historicalMetadata(
  row: AgentRequestRow,
  input: {
    now: string;
    kind: FeedbackKind;
    surface: FeedbackMetadata["surface"];
    severity: FeedbackMetadata["severity"];
    needsAttention: boolean;
    recommendation: string;
  },
): FeedbackMetadata {
  const legacyStatus = feedbackStatusFromLegacy(row.status);
  const context = rowContext(row);
  return {
    version: 1,
    clusterId: row.id,
    isCanonical: true,
    status: legacyStatus,
    kind: row.intent === "bug_report" ? "bug" : input.kind,
    surface: inferFeedbackSurface(
      typeof context.location === "string" ? context.location : null,
    ) === "other"
      ? input.surface
      : inferFeedbackSurface(
          typeof context.location === "string" ? context.location : null,
        ),
    title: row.description.slice(0, 100),
    summary: row.description.slice(0, 500),
    severity: input.severity,
    needsAttention: row.status === "failed" || input.needsAttention,
    recommendation: row.llm_notes ?? input.recommendation,
    aiMode: "fallback",
    aiModel: row.llm_model,
    duplicateConfidence: null,
    internalNotes: null,
    firstSeenAt: row.created_at,
    lastSeenAt: input.now,
    ownerNotifiedAt: null,
    ownerNotificationKeys: [],
    ownerNotificationClaimKeys: [],
    completedAt: legacyStatus === "completed" ? row.updated_at : null,
    requesterNotifiedAt: null,
    requesterNotifiedReporterIds: [],
    requesterNotificationSkippedReporterIds: [],
    requesterNotificationClaimedReporterIds: [],
  };
}

function ownerNotificationKey(input: {
  isNew: boolean;
  attentionEscalated: boolean;
  submissionCount: number;
  uniqueShopCount: number;
  addedNewShop: boolean;
}): string | null {
  if (input.isNew) return "created";
  if (input.attentionEscalated) return "attention";
  if (REPORT_MILESTONES.has(input.submissionCount)) {
    return `reports:${input.submissionCount}`;
  }
  if (input.addedNewShop && SHOP_MILESTONES.has(input.uniqueShopCount)) {
    return `shops:${input.uniqueShopCount}`;
  }
  return null;
}

async function claimOwnerNotification(
  admin: ReturnType<typeof createAdminSupabase>,
  canonicalId: string,
  key: string,
): Promise<boolean> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await admin
      .from("agent_requests")
      .select("*")
      .eq("id", canonicalId)
      .maybeSingle();
    if (error || !data) {
      console.warn("feedback owner notification claim reload failed", error);
      return false;
    }
    const row = data as AgentRequestRow;
    const metadata = readFeedbackMetadata(row.normalized_json);
    if (!metadata) return false;
    const delivered = new Set(metadata.ownerNotificationKeys ?? []);
    const claims = new Set(metadata.ownerNotificationClaimKeys ?? []);
    if (delivered.has(key) || claims.has(key)) return false;
    claims.add(key);
    const updatedAt = new Date().toISOString();
    const { data: updated, error: updateError } = await admin
      .from("agent_requests")
      .update({
        normalized_json: {
          ...rowContext(row),
          feedback: {
            ...metadata,
            ownerNotificationClaimKeys: [...claims],
          },
        } as Json,
        updated_at: updatedAt,
      })
      .eq("id", canonicalId)
      .eq("updated_at", row.updated_at)
      .select("id")
      .maybeSingle();
    if (updateError) {
      console.warn("feedback owner notification claim failed", updateError);
      return false;
    }
    if (updated) return true;
  }
  return false;
}

async function settleOwnerNotification(
  admin: ReturnType<typeof createAdminSupabase>,
  canonicalId: string,
  key: string,
  delivered: boolean,
): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await admin
      .from("agent_requests")
      .select("*")
      .eq("id", canonicalId)
      .maybeSingle();
    if (error || !data) {
      console.warn("feedback owner notification settlement reload failed", error);
      return;
    }
    const row = data as AgentRequestRow;
    const metadata = readFeedbackMetadata(row.normalized_json);
    if (!metadata) return;
    const claims = new Set(metadata.ownerNotificationClaimKeys ?? []);
    claims.delete(key);
    const sent = new Set(metadata.ownerNotificationKeys ?? []);
    if (delivered) sent.add(key);
    const updatedAt = new Date().toISOString();
    const { data: updated, error: updateError } = await admin
      .from("agent_requests")
      .update({
        normalized_json: {
          ...rowContext(row),
          feedback: {
            ...metadata,
            ownerNotificationClaimKeys: [...claims],
            ownerNotificationKeys: [...sent],
            ownerNotifiedAt: delivered ? updatedAt : metadata.ownerNotifiedAt ?? null,
          },
        } as Json,
        updated_at: updatedAt,
      })
      .eq("id", canonicalId)
      .eq("updated_at", row.updated_at)
      .select("id")
      .maybeSingle();
    if (updateError) {
      console.warn("feedback owner notification settlement failed", updateError);
      return;
    }
    if (updated) return;
  }
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as CreateFeedbackBody | null;
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  if (!description) {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return NextResponse.json(
      { error: `description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer` },
      { status: 400 },
    );
  }

  const identity = await resolveReporterIdentity(supabase, user);
  if (identity instanceof NextResponse) return identity;

  const requestedKind = normalizeKind(body?.kind);
  const context = contextFromBody(body ?? {});
  const admin = createAdminSupabase();

  if (context.submissionKey) {
    const existing = await findReplay(admin, identity.id, context.submissionKey);
    if (existing) return replayResponse(existing);
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

  const normalizedJson: Json = {
    ...context,
    feedback: initialFeedback,
  };

  const { data: inserted, error: insertError } = await admin
    .from("agent_requests")
    .insert({
      shop_id: identity.shopId,
      reporter_id: identity.id,
      reporter_role: identity.role,
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
    if (insertError?.code === "23505" && context.submissionKey) {
      const winner = await findReplay(admin, identity.id, context.submissionKey);
      if (winner) return replayResponse(winner);
    }
    console.error("feedback insert failed", insertError);
    return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 });
  }

  const canonicalId = duplicateId ?? inserted.id;
  let canonicalRow: AgentRequestRow | null = duplicateId
    ? rows.find((row) => row.id === duplicateId) ?? null
    : (inserted as AgentRequestRow);

  if (duplicateId) {
    const { data: canonicalLookup, error: canonicalLookupError } = await admin
      .from("agent_requests")
      .select("*")
      .eq("id", duplicateId)
      .maybeSingle();
    if (canonicalLookupError) {
      console.warn("feedback canonical lookup failed", canonicalLookupError);
    }
    canonicalRow = (canonicalLookup as AgentRequestRow | null) ?? canonicalRow;
  }

  const previousCanonicalMeta = canonicalRow
    ? readFeedbackMetadata(canonicalRow.normalized_json)
    : null;

  if (!duplicateId) {
    const selfMetadata: FeedbackMetadata = {
      ...initialFeedback,
      clusterId: inserted.id,
      isCanonical: true,
    };
    const { data: updated, error } = await admin
      .from("agent_requests")
      .update({
        normalized_json: {
          ...rowContext(inserted as AgentRequestRow),
          feedback: selfMetadata,
        } as Json,
      })
      .eq("id", inserted.id)
      .select("*")
      .single();
    if (error) console.warn("feedback canonical self-link update failed", error);
    if (updated) canonicalRow = updated as AgentRequestRow;
  } else if (canonicalRow) {
    for (let attempt = 0; attempt < 5 && canonicalRow; attempt += 1) {
      const existingMeta = readFeedbackMetadata(canonicalRow.normalized_json);
      const canonicalMeta = existingMeta ?? historicalMetadata(canonicalRow, {
        now,
        kind: triage.output.kind,
        surface: triage.output.surface,
        severity: triage.output.severity,
        needsAttention: triage.output.needsAttention,
        recommendation: triage.output.recommendation,
      });
      const severity =
        (SEVERITY_RANK[triage.output.severity] ?? 0) >
        (SEVERITY_RANK[canonicalMeta.severity] ?? 0)
          ? triage.output.severity
          : canonicalMeta.severity;
      const nextMeta: FeedbackMetadata = {
        ...canonicalMeta,
        clusterId: canonicalId,
        isCanonical: true,
        lastSeenAt: now > canonicalMeta.lastSeenAt ? now : canonicalMeta.lastSeenAt,
        needsAttention: canonicalMeta.needsAttention || triage.output.needsAttention,
        severity,
      };
      const aggregateUpdatedAt = new Date().toISOString();
      const { data: updated, error } = await admin
        .from("agent_requests")
        .update({
          normalized_json: {
            ...rowContext(canonicalRow),
            feedback: nextMeta,
          } as Json,
          updated_at: aggregateUpdatedAt,
        })
        .eq("id", canonicalId)
        .eq("updated_at", canonicalRow.updated_at)
        .select("*")
        .maybeSingle();
      if (error) {
        console.warn("feedback canonical aggregate update failed", error);
        break;
      }
      if (updated) {
        canonicalRow = updated as AgentRequestRow;
        break;
      }
      const { data: latest } = await admin
        .from("agent_requests")
        .select("*")
        .eq("id", canonicalId)
        .maybeSingle();
      if (!latest) break;
      canonicalRow = latest as AgentRequestRow;
    }
  }

  const { rows: clusterRows, error: clusterError } = await fetchClusterRows(
    admin,
    canonicalId,
  );
  if (clusterError) console.warn("feedback cluster load failed", clusterError);
  const groupRows = [
    ...clusterRows,
    inserted as AgentRequestRow,
  ].filter(
    (row, index, all) => all.findIndex((candidate) => candidate.id === row.id) === index,
  );
  const uniqueShops = new Set(groupRows.map((row) => row.shop_id).filter(Boolean));
  const priorShops = new Set(
    groupRows
      .filter((row) => row.id !== inserted.id)
      .map((row) => row.shop_id)
      .filter(Boolean),
  );
  const addedNewShop = inserted.shop_id !== null && !priorShops.has(inserted.shop_id);
  const attentionEscalated =
    triage.output.needsAttention && previousCanonicalMeta?.needsAttention !== true;
  const notificationKey = ownerNotificationKey({
    isNew: duplicateId === null,
    attentionEscalated,
    submissionCount: groupRows.length,
    uniqueShopCount: uniqueShops.size,
    addedNewShop,
  });

  if (
    notificationKey &&
    (await claimOwnerNotification(admin, canonicalId, notificationKey))
  ) {
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
    await settleOwnerNotification(
      admin,
      canonicalId,
      notificationKey,
      delivered,
    );
  }

  return NextResponse.json({
    ok: true,
    submissionId: inserted.id,
    matchedExisting: duplicateId !== null,
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
      uniqueUserCount: new Set(
        submissions.map((row) => row.reporter_id).filter(Boolean),
      ).size,
      uniqueShopCount: new Set(
        submissions.map((row) => row.shop_id).filter(Boolean),
      ).size,
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
