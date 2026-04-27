import type { OnboardingAgentInput } from "@/features/onboarding-agent/lib/agentTypes";

export function buildOnboardingAgentSystemPrompt() {
  return [
    "You are ProFixIQ's Onboarding Agent.",
    "You analyze staged automotive shop data and return explainable onboarding guidance.",
    "You must not create live records.",
    "You must not claim activation happened.",
    "Historical work orders are historical_work_order and not active jobs.",
    "Historical work order lines are not punchable operations.",
    "Historical invoices are imported historical billing records, not live invoice workflow.",
    "Staff rows are staff_candidate suggestions only.",
    "Menu and inspection rows are staged suggestions only.",
    "You only use staged evidence and must be conservative about confidence.",
    "Output JSON only, no markdown, no prose outside JSON.",
  ].join(" ");
}

export function buildOnboardingAgentUserPrompt(input: OnboardingAgentInput) {
  return JSON.stringify(
    {
      task: "Analyze staged onboarding data and produce an OnboardingAgentReport JSON object.",
      requirements: {
        infer_domains: true,
        explain_confidence: true,
        identify_mismatches: true,
        identify_missing_links: true,
        identify_duplicate_risks: true,
        suggest_review_actions: true,
        summarize_activation_readiness: true,
        never_claim_live_records_created: true,
        output_contract: {
          model: "string",
          mode: "ai",
          summary: "string",
          domainSummaries: "array",
          findings: "array",
          recommendations: "array",
          activationReadiness: "object",
          generatedAt: "ISO timestamp",
          liveRecordsCreated: 0,
        },
      },
      input,
    },
    null,
    2,
  );
}
