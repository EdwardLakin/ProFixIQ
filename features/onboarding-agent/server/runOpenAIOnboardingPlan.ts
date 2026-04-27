import type { OnboardingAgentInputPayload, OnboardingAgentPlan, OnboardingAgentPlanDomain } from "@/features/onboarding-agent/lib/agentPlanTypes";
import { runOpenAIStructuredJson } from "@/features/shared/lib/server/openai-structured";
import { validateOnboardingAgentPlan } from "@/features/onboarding-agent/server/validateOnboardingAgentPlan";

function domainOrUnknown(value: string): OnboardingAgentPlanDomain {
  return (["customers", "vehicles", "history", "invoices", "parts", "vendors", "staff", "menu", "inspections", "unknown"].includes(value)
    ? value
    : "unknown") as OnboardingAgentPlanDomain;
}

function buildFallbackPlan(input: OnboardingAgentInputPayload, model: string): OnboardingAgentPlan {
  return validateOnboardingAgentPlan({
    modeFallback: "deterministic_fallback",
    model,
    deterministicByFileId: new Map(input.files.map((f) => [f.fileId, { filename: f.filename, inferredDomain: domainOrUnknown(f.deterministicDetectedDomain), rowCount: f.rowCount }])),
    validFileIds: new Set(input.files.map((f) => f.fileId)),
    candidate: {
      version: "onboarding_agent_plan_v1",
      mode: "deterministic_fallback",
      confidence: 0.4,
      summary: "AI reasoning unavailable; deterministic staging was used.",
      files: input.files.map((f) => ({
        fileId: f.fileId,
        filename: f.filename,
        inferredDomain: f.detectedDomain,
        confidence: 0.65,
        reasoning: "Fallback domain detection from deterministic parser.",
        headerMap: {},
        requiredFieldsPresent: [],
        missingImportantFields: [],
        rowCountEstimate: f.rowCount,
        recommendedParserMode: "stage_entities",
      })),
      entityPlan: {},
      relationshipPlan: [],
      reviewGroups: [],
      activationReadiness: "review_required",
      activationPreview: { creates: {}, requiresReview: 0, blockingIssues: 0, risks: ["AI unavailable"] },
      liveRecordsCreated: 0,
    },
  });
}

export async function runOpenAIOnboardingPlan(params: {
  input: OnboardingAgentInputPayload;
  requireAi?: boolean;
}): Promise<{ plan: OnboardingAgentPlan; warning?: string }> {
  const validFileIds = new Set(params.input.files.map((file) => file.fileId));
  const rowsSampled = params.input.files.reduce((sum, file) => sum + file.sampleRows.length, 0);

  const result = await runOpenAIStructuredJson<OnboardingAgentPlan>({
    purpose: "onboarding",
    feature: "onboarding-agent-plan",
    schemaName: "OnboardingAgentPlan",
    system: "You are the ProFixIQ onboarding migration planner. You produce JSON only. Never claim live record creation. Staged-only semantics: historical work orders are not active jobs; historical invoices are not active invoice workflow; staff rows are candidates/invites, not auth users; menu/inspection rows are suggestions only.",
    user: {
      instruction: "Infer per-file domains, header mappings, review groups, relationships, and a dry-run activation preview. Header map contract is required: headerMap keys MUST be source/raw headers and values MUST be canonical fields. Use filename heavily, then headers/samples to refine. For known exports, do not return unknown. Use stage_entities for recognized domains. Missing links should create review groups rather than unsupported file outputs. Historical work orders/invoices may stage without resolved links. Staff rows are candidates only. Service catalog rows are menu suggestions only. Return strict OnboardingAgentPlan JSON.",
      knownFilesHint: ["customers.csv", "vehicles.csv", "work_orders_history.csv", "invoices.csv", "parts_inventory.csv", "vendors.csv", "staff_users.csv", "service_catalog.csv"],
      input: params.input,
    },
    requireAI: params.requireAi,
    temperature: 0.1,
    fallback: (model) => buildFallbackPlan(params.input, model),
    validate: (candidate, model) => validateOnboardingAgentPlan({
      candidate,
      validFileIds,
      model,
      deterministicByFileId: new Map(params.input.files.map((f) => [f.fileId, { filename: f.filename, inferredDomain: domainOrUnknown(f.deterministicDetectedDomain), rowCount: f.rowCount }])),
      modeFallback: "ai_planned",
    }),
  });

  console.info("[onboarding-agent] plan summary", {
    sessionId: params.input.sessionId,
    shopId: params.input.shopId,
    files: params.input.files.length,
    rowsSampled,
    model: result.model,
    mode: result.mode,
    liveRecordsCreated: 0,
  });
  console.info("[onboarding-agent] ai input files", params.input.files.map((file) => ({
    fileId: file.fileId,
    filename: file.filename,
    headers: file.headers.length,
    sampleRows: file.sampleRows.length,
    detectedDomain: file.detectedDomain,
  })));

  return {
    plan: result.output,
    warning: result.warning,
  };
}
