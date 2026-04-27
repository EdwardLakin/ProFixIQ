import type { OnboardingAgentInputPayload, OnboardingAgentPlan } from "@/features/onboarding-agent/lib/agentPlanTypes";
import { getOnboardingAgentModel } from "@/features/onboarding-agent/server/model";
import { validateOnboardingAgentPlan } from "@/features/onboarding-agent/server/validateOnboardingAgentPlan";

function buildFallbackPlan(input: OnboardingAgentInputPayload, model: string): OnboardingAgentPlan {
  return validateOnboardingAgentPlan({
    modeFallback: "deterministic_fallback",
    model,
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
  const model = getOnboardingAgentModel();
  const validFileIds = new Set(params.input.files.map((file) => file.fileId));

  if (!process.env.OPENAI_API_KEY?.trim()) {
    if (params.requireAi) throw new Error("AI is required but OPENAI_API_KEY is not configured.");
    return { plan: buildFallbackPlan(params.input, model), warning: "AI reasoning unavailable; deterministic staging was used." };
  }

  const { openai } = await import("../../../lib/server/openai");
  const started = Date.now();

  try {
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are the ProFixIQ onboarding migration planner. You produce JSON only. Never claim live record creation. Staged-only semantics: historical work orders are not active jobs; historical invoices are not active invoice workflow; staff rows are candidates/invites, not auth users; menu/inspection rows are suggestions only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            instruction: "Infer per-file domains, header mappings, review groups, relationships, and a dry-run activation preview. Return strict OnboardingAgentPlan JSON.",
            knownFilesHint: ["customers.csv", "vehicles.csv", "work_orders_history.csv", "invoices.csv", "parts_inventory.csv", "vendors.csv", "staff_users.csv", "service_catalog.csv"],
            input: params.input,
          }),
        },
      ],
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) throw new Error("No response content returned by model");
    const parsed = JSON.parse(content);
    const plan = validateOnboardingAgentPlan({ candidate: parsed, validFileIds, model, modeFallback: "ai_planned" });

    console.info("[onboarding-agent] openai plan", {
      sessionId: params.input.sessionId,
      shopId: params.input.shopId,
      files: params.input.files.length,
      rowsSampled: params.input.files.reduce((sum, f) => sum + f.sampleRows.length, 0),
      mode: plan.mode,
      model,
      confidence: plan.confidence,
      durationMs: Date.now() - started,
      liveRecordsCreated: 0,
    });

    return { plan };
  } catch (error) {
    console.warn("[onboarding-agent] openai planning fallback", {
      sessionId: params.input.sessionId,
      shopId: params.input.shopId,
      model,
      error: error instanceof Error ? error.message : "unknown",
      durationMs: Date.now() - started,
      liveRecordsCreated: 0,
    });
    if (params.requireAi) throw new Error("AI planning is required but unavailable.");
    return { plan: buildFallbackPlan(params.input, model), warning: "AI reasoning unavailable; deterministic staging was used." };
  }
}
