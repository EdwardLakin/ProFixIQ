import "server-only";

export type AIFallbackMode = "hard_fail" | "graceful_empty" | "cached_if_available";

export type AIPolicy = {
  feature: AIFeature;
  modelPurpose: "fast" | "reasoning" | "extraction" | "vision";
  timeoutMs: number;
  maxTokens: number;
  fallbackMode: AIFallbackMode;
};

export type AIFeature =
  | "work_orders_suggest_lines"
  | "ai_summarize_stats"
  | "openai_realtime_token"
  | "work_order_documentation_rewrite"
  | "branding_generate_logo";

const AI_POLICIES: Record<AIFeature, AIPolicy> = {
  work_orders_suggest_lines: {
    feature: "work_orders_suggest_lines",
    modelPurpose: "fast",
    timeoutMs: 15000,
    maxTokens: 500,
    fallbackMode: "graceful_empty",
  },
  ai_summarize_stats: {
    feature: "ai_summarize_stats",
    modelPurpose: "fast",
    timeoutMs: 12000,
    maxTokens: 300,
    fallbackMode: "graceful_empty",
  },
  openai_realtime_token: {
    feature: "openai_realtime_token",
    modelPurpose: "fast",
    timeoutMs: 10000,
    maxTokens: 0,
    fallbackMode: "hard_fail",
  },
  work_order_documentation_rewrite: {
    feature: "work_order_documentation_rewrite",
    modelPurpose: "extraction",
    timeoutMs: 15000,
    maxTokens: 700,
    fallbackMode: "hard_fail",
  },
  branding_generate_logo: {
    feature: "branding_generate_logo",
    modelPurpose: "vision",
    timeoutMs: 30000,
    maxTokens: 0,
    fallbackMode: "hard_fail",
  },
};

export function getAIPolicy(feature: AIFeature): AIPolicy {
  return AI_POLICIES[feature];
}
