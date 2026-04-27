import {
  ONBOARDING_AGENT_PLAN_VERSION,
  type EntityPlanSummary,
  type OnboardingAgentPlan,
  type OnboardingAgentPlanDomain,
} from "@/features/onboarding-agent/lib/agentPlanTypes";

const DOMAINS = new Set<OnboardingAgentPlanDomain>(["customers", "vehicles", "history", "invoices", "parts", "vendors", "staff", "menu", "inspections", "unknown"]);

function asObj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
function asArr(value: unknown) {
  return Array.isArray(value) ? value : [];
}
function asString(v: unknown, fallback = "") {
  return typeof v === "string" ? v : fallback;
}
function asNum(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function clamp01(v: unknown, fb = 0.5) {
  return Math.max(0, Math.min(1, asNum(v, fb)));
}

function sanitizeEntityPlan(value: unknown): EntityPlanSummary {
  const o = asObj(value);
  return {
    staged: Math.max(0, Math.floor(asNum(o.staged))),
    ready: Math.max(0, Math.floor(asNum(o.ready))),
    review: Math.max(0, Math.floor(asNum(o.review))),
    confidence: clamp01(o.confidence, 0.5),
    notes: asArr(o.notes).slice(0, 10).map((x) => asString(x)).filter(Boolean),
  };
}

export function validateOnboardingAgentPlan(params: {
  candidate: unknown;
  validFileIds: Set<string>;
  modeFallback?: OnboardingAgentPlan["mode"];
  model?: string;
}): OnboardingAgentPlan {
  const root = asObj(params.candidate);

  const files = asArr(root.files).slice(0, 50).map((raw) => {
    const o = asObj(raw);
    const fileId = asString(o.fileId);
    if (!params.validFileIds.has(fileId)) return null;
    const inferred = asString(o.inferredDomain, "unknown") as OnboardingAgentPlanDomain;
    return {
      fileId,
      filename: asString(o.filename) || fileId,
      inferredDomain: DOMAINS.has(inferred) ? inferred : "unknown",
      confidence: clamp01(o.confidence, 0.5),
      reasoning: asString(o.reasoning).slice(0, 500),
      headerMap: Object.fromEntries(
        Object.entries(asObj(o.headerMap)).slice(0, 80).map(([k, v]) => [k, asString(v).slice(0, 80)]),
      ),
      requiredFieldsPresent: asArr(o.requiredFieldsPresent).slice(0, 30).map((x) => asString(x)),
      missingImportantFields: asArr(o.missingImportantFields).slice(0, 30).map((x) => asString(x)),
      rowCountEstimate: Math.max(0, Math.floor(asNum(o.rowCountEstimate))),
      recommendedParserMode: (["stage_entities", "stage_review_only", "ignore", "unsupported"].includes(asString(o.recommendedParserMode))
        ? asString(o.recommendedParserMode)
        : "stage_review_only") as "stage_entities" | "stage_review_only" | "ignore" | "unsupported",
    };
  }).filter(Boolean) as OnboardingAgentPlan["files"];

  const ep = asObj(root.entityPlan);
  const reviewGroups = asArr(root.reviewGroups).slice(0, 200).map((raw) => {
    const o = asObj(raw);
    const severity = asString(o.severity);
    return {
      severity: (["low", "medium", "high", "blocking"].includes(severity) ? severity : "medium") as "low" | "medium" | "high" | "blocking",
      domain: asString(o.domain, "unknown"),
      issueType: asString(o.issueType, "needs_review"),
      affectedRowCount: Math.max(0, Math.floor(asNum(o.affectedRowCount))),
      sampleRows: asArr(o.sampleRows).slice(0, 10).map((x) => Math.max(0, Math.floor(asNum(x)))),
      summary: asString(o.summary).slice(0, 280),
      recommendedAction: (["accept", "ignore", "link_existing", "edit_mapping", "upload_better_file", "manual_review"].includes(asString(o.recommendedAction))
        ? asString(o.recommendedAction)
        : "manual_review") as "accept" | "ignore" | "link_existing" | "edit_mapping" | "upload_better_file" | "manual_review",
    };
  });

  return {
    version: ONBOARDING_AGENT_PLAN_VERSION,
    mode: root.mode === "ai_planned" || root.mode === "deterministic_fallback" ? root.mode : (params.modeFallback ?? "deterministic_fallback"),
    model: params.model,
    liveRecordsCreated: 0,
    confidence: clamp01(root.confidence, 0.5),
    summary: asString(root.summary, "Onboarding plan ready.").slice(0, 1200),
    files,
    entityPlan: {
      customers: sanitizeEntityPlan(ep.customers),
      vehicles: sanitizeEntityPlan(ep.vehicles),
      historicalWorkOrders: sanitizeEntityPlan(ep.historicalWorkOrders),
      historicalInvoices: sanitizeEntityPlan(ep.historicalInvoices),
      parts: sanitizeEntityPlan(ep.parts),
      vendors: sanitizeEntityPlan(ep.vendors),
      staffCandidates: sanitizeEntityPlan(ep.staffCandidates),
      menuSuggestions: sanitizeEntityPlan(ep.menuSuggestions),
      inspectionSuggestions: sanitizeEntityPlan(ep.inspectionSuggestions),
    },
    relationshipPlan: asArr(root.relationshipPlan).slice(0, 100).map((raw) => {
      const o = asObj(raw);
      return {
        fromDomain: asString(o.fromDomain, "unknown"),
        toDomain: asString(o.toDomain, "unknown"),
        relationshipType: asString(o.relationshipType, "unknown"),
        confidence: clamp01(o.confidence, 0.5),
        matchingKeys: asArr(o.matchingKeys).slice(0, 10).map((x) => asString(x)),
        reasoning: asString(o.reasoning).slice(0, 280),
        expectedLinks: o.expectedLinks == null ? null : Math.max(0, Math.floor(asNum(o.expectedLinks))),
        reviewRequired: Boolean(o.reviewRequired),
      };
    }),
    reviewGroups,
    activationReadiness: (["not_ready", "review_required", "ready_for_dry_run", "blocked"].includes(asString(root.activationReadiness))
      ? asString(root.activationReadiness)
      : "review_required") as OnboardingAgentPlan["activationReadiness"],
    activationPreview: {
      creates: {
        customers: Math.max(0, Math.floor(asNum(asObj(asObj(root.activationPreview).creates).customers))),
        vehicles: Math.max(0, Math.floor(asNum(asObj(asObj(root.activationPreview).creates).vehicles))),
        historicalWorkOrders: Math.max(0, Math.floor(asNum(asObj(asObj(root.activationPreview).creates).historicalWorkOrders))),
        historicalInvoices: Math.max(0, Math.floor(asNum(asObj(asObj(root.activationPreview).creates).historicalInvoices))),
        parts: Math.max(0, Math.floor(asNum(asObj(asObj(root.activationPreview).creates).parts))),
        vendors: Math.max(0, Math.floor(asNum(asObj(asObj(root.activationPreview).creates).vendors))),
        staffCandidates: Math.max(0, Math.floor(asNum(asObj(asObj(root.activationPreview).creates).staffCandidates))),
        menuSuggestions: Math.max(0, Math.floor(asNum(asObj(asObj(root.activationPreview).creates).menuSuggestions))),
        inspectionSuggestions: Math.max(0, Math.floor(asNum(asObj(asObj(root.activationPreview).creates).inspectionSuggestions))),
      },
      requiresReview: Math.max(0, Math.floor(asNum(asObj(root.activationPreview).requiresReview))),
      blockingIssues: Math.max(0, Math.floor(asNum(asObj(root.activationPreview).blockingIssues))),
      risks: asArr(asObj(root.activationPreview).risks).slice(0, 20).map((x) => asString(x)),
    },
  };
}
