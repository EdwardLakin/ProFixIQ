export const FEEDBACK_STATUSES = [
  "new",
  "reviewing",
  "planned",
  "in_progress",
  "completed",
  "declined",
] as const;

export const FEEDBACK_KINDS = [
  "bug",
  "feature_request",
  "workflow_improvement",
  "usability",
  "catalog_request",
  "other",
] as const;

export const FEEDBACK_SURFACES = [
  "shop",
  "fleet",
  "field",
  "equipment",
  "mobile",
  "customer_portal",
  "ops",
  "other",
] as const;

export const FEEDBACK_SEVERITIES = ["low", "normal", "high", "critical"] as const;

export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
export type FeedbackSurface = (typeof FEEDBACK_SURFACES)[number];
export type FeedbackSeverity = (typeof FEEDBACK_SEVERITIES)[number];

export type FeedbackMetadata = {
  version: 1;
  clusterId: string | null;
  isCanonical: boolean;
  status: FeedbackStatus;
  kind: FeedbackKind;
  surface: FeedbackSurface;
  title: string;
  summary: string;
  severity: FeedbackSeverity;
  needsAttention: boolean;
  recommendation: string;
  aiMode: "ai" | "fallback";
  aiModel: string | null;
  duplicateConfidence: number | null;
  internalNotes?: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  ownerNotifiedAt?: string | null;
  completedAt?: string | null;
  requesterNotifiedAt?: string | null;
  requesterNotifiedReporterIds?: string[];
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function readFeedbackMetadata(value: unknown): FeedbackMetadata | null {
  if (!isRecord(value)) return null;
  const feedback = isRecord(value.feedback) ? value.feedback : null;
  if (!feedback || feedback.version !== 1) return null;
  if (typeof feedback.title !== "string" || typeof feedback.summary !== "string") return null;
  const status = FEEDBACK_STATUSES.find((candidate) => candidate === feedback.status);
  const kind = FEEDBACK_KINDS.find((candidate) => candidate === feedback.kind);
  const surface = FEEDBACK_SURFACES.find((candidate) => candidate === feedback.surface);
  const severity = FEEDBACK_SEVERITIES.find((candidate) => candidate === feedback.severity);
  if (!status || !kind || !surface || !severity) return null;

  return {
    version: 1,
    clusterId: typeof feedback.clusterId === "string" ? feedback.clusterId : null,
    isCanonical: feedback.isCanonical === true,
    status,
    kind,
    surface,
    title: feedback.title,
    summary: feedback.summary,
    severity,
    needsAttention: feedback.needsAttention === true,
    recommendation: typeof feedback.recommendation === "string" ? feedback.recommendation : "Review when practical.",
    aiMode: feedback.aiMode === "ai" ? "ai" : "fallback",
    aiModel: typeof feedback.aiModel === "string" ? feedback.aiModel : null,
    duplicateConfidence: typeof feedback.duplicateConfidence === "number" ? feedback.duplicateConfidence : null,
    internalNotes: typeof feedback.internalNotes === "string" ? feedback.internalNotes : null,
    firstSeenAt: typeof feedback.firstSeenAt === "string" ? feedback.firstSeenAt : new Date(0).toISOString(),
    lastSeenAt: typeof feedback.lastSeenAt === "string" ? feedback.lastSeenAt : new Date(0).toISOString(),
    ownerNotifiedAt: typeof feedback.ownerNotifiedAt === "string" ? feedback.ownerNotifiedAt : null,
    completedAt: typeof feedback.completedAt === "string" ? feedback.completedAt : null,
    requesterNotifiedAt: typeof feedback.requesterNotifiedAt === "string" ? feedback.requesterNotifiedAt : null,
    requesterNotifiedReporterIds: Array.isArray(feedback.requesterNotifiedReporterIds)
      ? feedback.requesterNotifiedReporterIds.filter(
          (value): value is string => typeof value === "string" && value.trim().length > 0,
        )
      : [],
  };
}

export function inferFeedbackSurface(pathname: string | null | undefined): FeedbackSurface {
  const path = (pathname ?? "").toLowerCase();
  if (path.startsWith("/fleet")) return "fleet";
  if (path.startsWith("/field")) return "field";
  if (path.startsWith("/equipment")) return "equipment";
  if (path.startsWith("/mobile")) return "mobile";
  if (path.startsWith("/portal")) return "customer_portal";
  if (path.startsWith("/ops")) return "ops";
  if (path.startsWith("/dashboard") || path.startsWith("/work-orders")) return "shop";
  return "other";
}

export function feedbackKindToAgentIntent(kind: FeedbackKind):
  | "feature_request"
  | "bug_report"
  | "inspection_catalog_add"
  | "service_catalog_add"
  | "refactor" {
  if (kind === "bug") return "bug_report";
  if (kind === "catalog_request") return "service_catalog_add";
  return "feature_request";
}

export function legacyStatusForFeedback(status: FeedbackStatus):
  | "submitted"
  | "in_progress"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "failed"
  | "merged" {
  switch (status) {
    case "new":
      return "submitted";
    case "reviewing":
      return "approved";
    case "planned":
      return "awaiting_approval";
    case "in_progress":
      return "in_progress";
    case "completed":
      return "merged";
    case "declined":
      return "rejected";
  }
}

export function feedbackStatusFromLegacy(status: string): FeedbackStatus {
  switch (status) {
    case "in_progress":
      return "in_progress";
    case "awaiting_approval":
      return "planned";
    case "approved":
      return "reviewing";
    case "merged":
      return "completed";
    case "rejected":
      return "declined";
    default:
      return "new";
  }
}
