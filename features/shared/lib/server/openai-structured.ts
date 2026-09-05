import "server-only";

import { getOpenAIClient, isOpenAIConfigured } from "@/features/shared/lib/server/openai";
import {
  getOpenAIModelForPurpose,
  openAITemperatureParam,
  type OpenAIModelPurpose,
} from "@/features/shared/lib/server/openai-models";
import { runWithProviderTimeout } from "@/features/shared/lib/server/provider-timeout";

export type OpenAIStructuredJsonUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

// The Responses API's usage object uses input_tokens/output_tokens rather
// than Chat Completions' prompt_tokens/completion_tokens. Read defensively
// so a field-name change (or a test mock with no `usage` at all, as
// openai-structured.test.ts uses) never throws — callers that don't need
// usage never look at this field.
function readUsage(response: unknown): OpenAIStructuredJsonUsage {
  const usage =
    response && typeof response === "object" && "usage" in response
      ? (response as { usage?: unknown }).usage
      : null;
  const record =
    usage && typeof usage === "object" ? (usage as Record<string, unknown>) : null;
  const numberOrNull = (...keys: string[]): number | null => {
    for (const key of keys) {
      const value = record?.[key];
      if (typeof value === "number" && Number.isFinite(value)) return value;
    }
    return null;
  };

  return {
    promptTokens: numberOrNull("input_tokens", "prompt_tokens"),
    completionTokens: numberOrNull("output_tokens", "completion_tokens"),
    totalTokens: numberOrNull("total_tokens"),
  };
}

export async function runOpenAIStructuredJson<T>(params: {
  purpose: OpenAIModelPurpose;
  feature: string;
  system: string;
  user: unknown;
  schemaName: string;
  schema?: unknown;
  validate?: (candidate: unknown, model: string) => T;
  fallback: (model: string) => T;
  requireAI?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
  /**
   * When set, the model call is aborted after this many milliseconds (see
   * runWithProviderTimeout). Omitted by default, matching every existing
   * caller's current behavior exactly; callers that need provider-timeout
   * protection (e.g. an API route with its own request deadline) opt in.
   */
  timeoutMs?: number;
}): Promise<{
  mode: "ai" | "fallback";
  model: string;
  output: T;
  warning?: string;
  usage?: OpenAIStructuredJsonUsage;
  latencyMs: number;
}> {
  const started = Date.now();
  const model = getOpenAIModelForPurpose(params.purpose);

  if (!isOpenAIConfigured()) {
    if (params.requireAI) {
      throw new Error(`[${params.feature}] AI is required but OPENAI_API_KEY is not configured.`);
    }

    return {
      mode: "fallback",
      model,
      output: params.fallback(model),
      warning: "OPENAI_API_KEY is not configured.",
      latencyMs: Date.now() - started,
    };
  }

  try {
    const client = getOpenAIClient();

    const requestBody = {
      model,
      ...openAITemperatureParam(model, params.temperature ?? 0.1),
      ...(params.maxOutputTokens ? { max_output_tokens: params.maxOutputTokens } : {}),
      text: {
        format: {
          type: "json_object" as const,
        },
      },
      input: [
        {
          role: "system" as const,
          content: [{ type: "input_text" as const, text: params.system }],
        },
        {
          role: "user" as const,
          content: [{ type: "input_text" as const, text: JSON.stringify(params.user) }],
        },
      ],
    };

    const response = params.timeoutMs
      ? await runWithProviderTimeout(params.timeoutMs, (signal) =>
          client.responses.create(requestBody, { signal }),
        )
      : await client.responses.create(requestBody);

    const outputText = response.output_text?.trim();
    if (!outputText) {
      throw new Error("No structured response text returned.");
    }

    const parsed = JSON.parse(outputText);
    const output = params.validate ? params.validate(parsed, model) : (parsed as T);
    const usage = readUsage(response);
    const latencyMs = Date.now() - started;

    console.info("[openai-structured] success", {
      feature: params.feature,
      purpose: params.purpose,
      model,
      mode: "ai",
      durationMs: latencyMs,
    });

    return { mode: "ai", model, output, usage, latencyMs };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    const latencyMs = Date.now() - started;

    console.warn("[openai-structured] fallback", {
      feature: params.feature,
      purpose: params.purpose,
      model,
      mode: "fallback",
      durationMs: latencyMs,
      errorClass: error instanceof Error ? error.name : "UnknownError",
      error: message.slice(0, 160),
    });

    if (params.requireAI) {
      throw new Error(`[${params.feature}] AI call failed: ${message}`);
    }

    return {
      mode: "fallback",
      model,
      output: params.fallback(model),
      warning: "AI call failed; deterministic fallback was used.",
      latencyMs,
    };
  }
}
