import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { getOpenAIRealtimeTranscriptionModel } from "@/features/shared/lib/openai-realtime-models";
import { getAIPolicy } from "@/features/shared/lib/server/ai-policy";
import { recordAITelemetry } from "@/features/shared/lib/server/ai-telemetry";
import {
  enforceAIOperationalPolicy,
  estimateAICostUsd,
  registerAIUsageEvent,
} from "@/features/shared/lib/server/ai-ops-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ----------------------------- Types ----------------------------- */

type OpenAIRealtimeSessionConfig = {
  session: {
    type: "transcription";
    audio: {
      input: {
        format: {
          type: "audio/pcm";
          rate: number;
        };
        noise_reduction?: {
          type: "near_field" | "far_field";
        };
        transcription: {
          model: string;
          language?: string;
        };
        turn_detection?: {
          type: "server_vad";
          threshold?: number;
          prefix_padding_ms?: number;
          silence_duration_ms?: number;
        };
      };
    };
  };
};


/* --------------------------- Helpers ---------------------------- */

function extractToken(
  data: unknown,
): { token: string; expiresAt?: number } | null {
  if (
    typeof data === "object" &&
    data !== null &&
    "value" in data &&
    typeof (data as { value?: unknown }).value === "string"
  ) {
    const d = data as { value: string; expires_at?: number };
    return { token: d.value, expiresAt: d.expires_at };
  }

  if (
    typeof data === "object" &&
    data !== null &&
    "client_secret" in data
  ) {
    const cs = (data as { client_secret?: unknown }).client_secret;
    if (
      typeof cs === "object" &&
      cs !== null &&
      "value" in cs &&
      typeof (cs as { value?: unknown }).value === "string"
    ) {
      const secret = cs as { value: string; expires_at?: number };
      return { token: secret.value, expiresAt: secret.expires_at };
    }
  }

  return null;
}

/* ----------------------------- Route ----------------------------- */

export async function GET() {
  const startedAt = Date.now();
  const policy = getAIPolicy("openai_realtime_token");
  const access = await requireShopScopedApiAccess();
  if (!access.ok) {
    return access.response;
  }
  const enforcement = enforceAIOperationalPolicy({
    feature: "openai_realtime_token",
    endpoint: "/api/openai/realtime-token",
    shopId: access.profile.shop_id,
  });
  if (!enforcement.allowed) {
    return NextResponse.json(
      { error: "AI token issuance temporarily limited", code: enforcement.code },
      { status: 429 },
    );
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    const transcriptionModel = getOpenAIRealtimeTranscriptionModel();

    if (!apiKey) {
      console.error("[realtime-token] Missing OPENAI_API_KEY");
      return NextResponse.json(
        {
          error: "Voice service is not configured",
          code: "realtime_not_configured",
        },
        { status: 503 },
      );
    }

    const sessionConfig: OpenAIRealtimeSessionConfig = {
      session: {
        type: "transcription",
        audio: {
          input: {
            format: {
              type: "audio/pcm",
              rate: 24000,
            },
            noise_reduction: {
              type: "near_field",
            },
            transcription: {
              model: transcriptionModel,
              language: "en",
            },
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500,
            },
          },
        },
      },
    };

    const response = await Promise.race([
      fetch("https://api.openai.com/v1/realtime/client_secrets", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(sessionConfig),
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("AI request timed out")), policy.timeoutMs),
      ),
    ]);

    const rawText = await response.text();

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      console.error("[realtime-token] Invalid JSON from OpenAI", rawText);
      return NextResponse.json(
        {
          error: "Voice service returned an invalid response",
          code: "realtime_invalid_response",
        },
        { status: 502 },
      );
    }

    if (!response.ok) {
      console.error("[realtime-token] OpenAI error", {
        status: response.status,
        statusText: response.statusText,
        body: parsed,
      });

      return NextResponse.json(
        {
          error: "Voice service could not start",
          code: "realtime_session_rejected",
          upstreamStatus: response.status,
        },
        { status: 502 },
      );
    }

    const extracted = extractToken(parsed);

    if (!extracted) {
      console.error(
        "[realtime-token] Unexpected response shape",
        parsed,
      );
      return NextResponse.json(
        {
          error: "Voice service returned an invalid response",
          code: "realtime_invalid_response",
        },
        { status: 502 },
      );
    }

    recordAITelemetry({
      feature: "openai_realtime_token",
      endpoint: "/api/openai/realtime-token",
      shop_id: access.profile.shop_id,
      user_id: access.profile.id,
      model: transcriptionModel,
      latency_ms: Date.now() - startedAt,
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null,
      estimated_cost_usd: estimateAICostUsd("openai_realtime_token", 1),
      status: "success",
      error_code: null,
      error_message: null,
    });
    registerAIUsageEvent({
      feature: "openai_realtime_token",
      endpoint: "/api/openai/realtime-token",
      shopId: access.profile.shop_id,
      model: transcriptionModel,
      totalTokens: 1,
      estimatedCostUsd: estimateAICostUsd("openai_realtime_token", 1),
      status: "success",
      errorCode: null,
    });

    return NextResponse.json(
      {
        token: extracted.token,
        expiresAt: extracted.expiresAt ?? null,
        transcriptionModel,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unhandled realtime token error";
    recordAITelemetry({
      feature: "openai_realtime_token",
      endpoint: "/api/openai/realtime-token",
      shop_id: access.profile.shop_id,
      user_id: access.profile.id,
      model: getOpenAIRealtimeTranscriptionModel(),
      latency_ms: Date.now() - startedAt,
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null,
      estimated_cost_usd: 0,
      status: "error",
      error_code: "realtime_token_error",
      error_message: message,
    });
    registerAIUsageEvent({
      feature: "openai_realtime_token",
      endpoint: "/api/openai/realtime-token",
      shopId: access.profile.shop_id,
      model: getOpenAIRealtimeTranscriptionModel(),
      totalTokens: null,
      estimatedCostUsd: 0,
      status: "error",
      errorCode: "realtime_token_error",
    });
    console.error("[realtime-token] Unhandled error", err);
    const timedOut = message === "AI request timed out";
    return NextResponse.json(
      {
        error: timedOut
          ? "Voice service took too long to respond"
          : "Voice service could not start",
        code: timedOut ? "realtime_upstream_timeout" : "realtime_token_error",
      },
      { status: timedOut ? 504 : 500 },
    );
  }
}
