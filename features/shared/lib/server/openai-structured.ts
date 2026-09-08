import "server-only";

import { getAITelemetryContext } from "@/features/shared/lib/server/ai-telemetry-context";
import {
  recordAITelemetry,
  type AITelemetryFeature,
} from "@/features/shared/lib/server/ai-telemetry";
import { getOpenAIClient, isOpenAIConfigured } from "@/features/shared/lib/server/openai";
import {
  getOpenAIModelForPurpose,
  openAITemperatureParam,
  type OpenAIModelPurpose,
} from "@/features/shared/lib/server/openai-models";
import { runWithProviderTimeout } from "@/features/shared/lib/server/provider-timeout";

export type OpenAIStructuredJsonUsage = {
  promptTokens: number | null;
  cachedPromptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

export type OpenAIStructuredTelemetryContext = {
  endpoint: string;
  shopId: string | null;
  userId: string | null;
};

function readUsage(response: unknown): OpenAIStructuredJsonUsage {
  const usage = response && typeof response === "object" && "usage" in response
    ? (response as { usage?: unknown }).usage
    : null;
  const record = usage && typeof usage === "object"
    ? (usage as Record<string, unknown>)
    : null;
  const numberOrNull = (...keys: string[]): number | null => {
    for (const key of keys) {
      const value = record?.[key];
      if (typeof value === "number" && Number.isFinite(value)) return value;
    }
    return null;
  };
  const nestedNumberOrNull = (parents: string[], child: string): number | null => {
    for (const parentKey of parents) {
      const parent = record?.[parentKey];
      if (!parent || typeof parent !== "object") continue;
      const value = (parent as Record<string, unknown>)[child];
      if (typeof value === "number" && Number.isFinite(value)) return value;
    }
    return null;
  };

  return {
    promptTokens: numberOrNull("input_tokens", "prompt_tokens"),
    cachedPromptTokens: nestedNumberOrNull(
      ["input_tokens_details", "prompt_tokens_details"],
      "cached_tokens",
    ),
    completionTokens: numberOrNull("output_tokens", "completion_tokens"),
    totalTokens: numberOrNull("total_tokens"),
  };
}

function responseId(response: unknown): string | null {
  if (!response || typeof response !== "object" || !("id" in response)) return null;
  const value = (response as { id?: unknown }).id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
  promptCacheKey?: string;
  telemetry?: OpenAIStructuredTelemetryContext;
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
  const telemetry = params.telemetry ?? getAITelemetryContext();
  let usage: OpenAIStructuredJsonUsage | undefined;
  let providerRequestId: string | null = null;

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
      ...(params.promptCacheKey ? { prompt_cache_key: params.promptCacheKey } : {}),
      text: { format: { type: "json_object" as const } },
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

    usage = readUsage(response);
    providerRequestId = responseId(response);
    const outputText = response.output_text?.trim();
    if (!outputText) throw new Error("No structured response text returned.");

    const parsed = JSON.parse(outputText);
    const output = params.validate ? params.validate(parsed, model) : (parsed as T);
    const latencyMs = Date.now() - started;

    console.info("[openai-structured] success", {
      feature: params.feature,
      purpose: params.purpose,
      model,
      mode: "ai",
      durationMs: latencyMs,
    });

    if (telemetry) {
      await recordAITelemetry({
        feature: params.feature as AITelemetryFeature,
        endpoint: telemetry.endpoint,
        shop_id: telemetry.shopId,
        user_id: telemetry.userId,
        provider: "openai",
        model,
        modality: "text",
        latency_ms: latencyMs,
        prompt_tokens: usage.promptTokens,
        cached_prompt_tokens: usage.cachedPromptTokens,
        completion_tokens: usage.completionTokens,
        total_tokens: usage.totalTokens,
        status: "success",
        error_code: null,
        error_message: null,
        provider_request_id: providerRequestId,
      });
    }

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

    if (telemetry) {
      await recordAITelemetry({
        feature: params.feature as AITelemetryFeature,
        endpoint: telemetry.endpoint,
        shop_id: telemetry.shopId,
        user_id: telemetry.userId,
        provider: "openai",
        model,
        modality: "text",
        latency_ms: latencyMs,
        prompt_tokens: usage?.promptTokens ?? null,
        cached_prompt_tokens: usage?.cachedPromptTokens ?? null,
        completion_tokens: usage?.completionTokens ?? null,
        total_tokens: usage?.totalTokens ?? null,
        status: "error",
        error_code: /timed out/i.test(message) ? "provider_timeout" : "provider_error",
        error_message: message.slice(0, 200),
        provider_request_id: providerRequestId,
      });
    }

    if (params.requireAI) throw new Error(`[${params.feature}] AI call failed: ${message}`);
    return {
      mode: "fallback",
      model,
      output: params.fallback(model),
      warning: "AI call failed; deterministic fallback was used.",
      usage,
      latencyMs,
    };
  }
}
