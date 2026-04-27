import "server-only";

import { getOpenAIClient, isOpenAIConfigured } from "@/features/shared/lib/server/openai";
import { getOpenAIModelForPurpose, type OpenAIModelPurpose } from "@/features/shared/lib/server/openai-models";

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
}): Promise<{ mode: "ai" | "fallback"; model: string; output: T; warning?: string }> {
  const started = Date.now();
  const model = getOpenAIModelForPurpose(params.purpose);

  if (!isOpenAIConfigured()) {
    if (params.requireAI) {
      throw new Error(`[${params.feature}] AI is required but OPENAI_API_KEY is not configured.`);
    }
    return { mode: "fallback", model, output: params.fallback(model), warning: "OPENAI_API_KEY is not configured." };
  }

  try {
    const client = getOpenAIClient();

    const response = await client.responses.create({
      model,
      temperature: params.temperature,
      max_output_tokens: params.maxOutputTokens,
      text: {
        format: {
          type: "json_object",
        },
      },
      input: [
        { role: "system", content: [{ type: "input_text", text: params.system }] },
        { role: "user", content: [{ type: "input_text", text: JSON.stringify(params.user) }] },
      ],
    });

    const outputText = response.output_text?.trim();
    if (!outputText) throw new Error("No structured response text returned.");

    const parsed = JSON.parse(outputText);
    const output = params.validate ? params.validate(parsed, model) : (parsed as T);

    console.info("[openai-structured] success", {
      feature: params.feature,
      purpose: params.purpose,
      model,
      mode: "ai",
      durationMs: Date.now() - started,
    });

    return { mode: "ai", model, output };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";

    console.warn("[openai-structured] fallback", {
      feature: params.feature,
      purpose: params.purpose,
      model,
      mode: "fallback",
      durationMs: Date.now() - started,
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
    };
  }
}
