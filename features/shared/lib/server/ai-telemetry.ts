import "server-only";

import type { AIFeature } from "@/features/shared/lib/server/ai-policy";

export type AITelemetryEvent = {
  feature: AIFeature;
  endpoint: string;
  shop_id: string | null;
  user_id: string | null;
  model: string | null;
  latency_ms: number;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  status: "success" | "error";
  error_code: string | null;
  error_message: string | null;
};

export function recordAITelemetry(event: AITelemetryEvent): void {
  console.info(JSON.stringify({ type: "ai_telemetry", ...event }));
}
