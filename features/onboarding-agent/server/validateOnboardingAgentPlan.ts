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


function normalizePlanDomain(raw: unknown): OnboardingAgentPlanDomain {
  const value = asString(raw, "unknown").toLowerCase();
  if (value === "historical_work_order" || value === "work_orders" || value === "work_order") return "history";
  if (value === "historical_invoice" || value === "invoice" || value === "billing") return "invoices";
  if (value === "customer") return "customers";
  if (value === "vehicle") return "vehicles";
  if (value === "part") return "parts";
  if (value === "vendor") return "vendors";
  if (value === "employee" || value === "users") return "staff";
  if (value === "service_catalog" || value === "service_menu") return "menu";
  return (DOMAINS.has(value as OnboardingAgentPlanDomain) ? value : "unknown") as OnboardingAgentPlanDomain;
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
  deterministicByFileId?: Map<string, { filename: string; inferredDomain: OnboardingAgentPlanDomain; rowCount: number }>;
  modeFallback?: OnboardingAgentPlan["mode"];
  model?: string;
}): OnboardingAgentPlan {
  const root = asObj(params.candidate);

  const parsedFiles = asArr(root.files).slice(0, 50).map((raw) => {
    const o = asObj(raw);
    const fileId = asString(o.fileId);
    if (!params.validFileIds.has(fileId)) return null;
    const inferred = normalizePlanDomain(o.inferredDomain);
    const headerMap = Object.fromEntries(
      Object.entries(asObj(o.headerMap)).slice(0, 80).map(([k, v]) => [k, asString(v).slice(0, 80)]).filter(([k, v]) => Boolean(k) && Boolean(v)),
    );
    const mappingSource = (["ai", "deterministic_alias", "mixed", "none"].includes(asString(o.mappingSource)) ? asString(o.mappingSource) : "none") as "ai" | "deterministic_alias" | "mixed" | "none";
    return {
      fileId,
      filename: asString(o.filename) || fileId,
      inferredDomain: inferred,
      confidence: clamp01(o.confidence, 0.5),
      reasoning: asString(o.reasoning).slice(0, 500),
      headerMap,
      mappingSource: Object.keys(headerMap).length > 0 && mappingSource === "none" ? "ai" : mappingSource,
      requiredFieldsPresent: asArr(o.requiredFieldsPresent).slice(0, 30).map((x) => asString(x)),
      missingImportantFields: asArr(o.missingImportantFields).slice(0, 30).map((x) => asString(x)),
      rowCountEstimate: Math.max(0, Math.floor(asNum(o.rowCountEstimate))),
      recommendedParserMode: (["stage_entities", "stage_review_only", "ignore", "unsupported"].includes(asString(o.recommendedParserMode))
        ? asString(o.recommendedParserMode)
        : "stage_entities") as "stage_entities" | "stage_review_only" | "ignore" | "unsupported",
    };
  }).filter(Boolean) as OnboardingAgentPlan["files"];

  const filesById = new Map(parsedFiles.map((file) => [file.fileId, file]));
  const files: OnboardingAgentPlan["files"] = [];
  for (const fileId of params.validFileIds) {
    const candidateFile = filesById.get(fileId);
    const deterministic = params.deterministicByFileId?.get(fileId);
    if (candidateFile) {
      if (candidateFile.inferredDomain === "unknown" && deterministic?.inferredDomain && deterministic.inferredDomain !== "unknown") {
        candidateFile.inferredDomain = deterministic.inferredDomain;
        candidateFile.reasoning = `${candidateFile.reasoning || "AI response incomplete."} Deterministic domain fallback applied.`;
      }
      if (!candidateFile.rowCountEstimate && deterministic?.rowCount) candidateFile.rowCountEstimate = deterministic.rowCount;
      if (!candidateFile.filename && deterministic?.filename) candidateFile.filename = deterministic.filename;
      files.push(candidateFile);
      continue;
    }

    files.push({
      fileId,
      filename: deterministic?.filename ?? fileId,
      inferredDomain: deterministic?.inferredDomain ?? "unknown",
      confidence: 0.5,
      reasoning: "AI omitted this file; deterministic fallback applied.",
      headerMap: {},
      mappingSource: "none",
      requiredFieldsPresent: [],
      missingImportantFields: [],
      rowCountEstimate: deterministic?.rowCount ?? 0,
      recommendedParserMode: deterministic?.inferredDomain && deterministic.inferredDomain !== "unknown" ? "stage_entities" : "stage_review_only",
    });
  }

  const ep = asObj(root.entityPlan);
  const reviewGroups = asArr(root.reviewGroups).slice(0, 200).map((raw) => {
    const o = asObj(raw);
    const severity = asString(o.severity);
    return {
      severity: (["low", "medium", "high", "blocking"].includes(severity) ? severity : "medium") as "low" | "medium" | "high" | "blocking",
      domain: normalizePlanDomain(o.domain),
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
        fromDomain: normalizePlanDomain(o.fromDomain),
        toDomain: normalizePlanDomain(o.toDomain),
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
