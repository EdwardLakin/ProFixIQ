import { NextRequest, NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { getOpenAILiveModel } from "@/features/shared/lib/openai-realtime-models";
import { getAIPolicy } from "@/features/shared/lib/server/ai-policy";
import { recordDurableAIUsage } from "@/features/shared/lib/server/ai-telemetry";
import {
  enforceAIOperationalPolicy,
  estimateAICostUsd,
  registerAIUsageEvent,
} from "@/features/shared/lib/server/ai-ops-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LiveSurface = "technician_copilot" | "inspection";

type LiveSessionRequest = {
  sdp?: unknown;
  surface?: unknown;
};

function getLiveSurface(value: unknown): LiveSurface {
  return value === "technician_copilot" ? "technician_copilot" : "inspection";
}

function liveInstructions(surface: LiveSurface): string {
  if (surface === "technician_copilot") {
    return [
      "You are the spoken interface for ProFixIQ Technician Copilot.",
      "Keep the conversation concise, natural, and shop-floor friendly.",
      "Delegate every request that depends on repair state, work orders, inspections, parts, labor, diagnosis, customer data, or application state to the client backend.",
      "Never invent repair facts, tool results, approvals, parts, labor, or completed actions.",
      "Only present backend-dependent facts after the client returns them.",
      "When the technician interrupts, stop speaking and listen.",
      "Use brief acknowledgments while backend work is running, without guessing the result.",
    ].join(" ");
  }

  return [
    "You are the spoken interface for ProFixIQ inspection and dictation voice control.",
    "Delegate every meaningful technician utterance to the client application.",
    "Do not alter inspection data yourself and do not answer from your own knowledge.",
    "Stay quiet unless the client provides commentary to speak.",
    "Never invent inspection findings, measurements, parts, labor, or completed actions.",
    "When interrupted, stop speaking and listen.",
  ].join(" ");
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const policy = getAIPolicy("openai_realtime_token");
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;

  const enforcement = enforceAIOperationalPolicy({
    feature: "openai_realtime_token",
    endpoint: "/api/openai/realtime-token",
    shopId: access.profile.shop_id,
  });
  if (!enforcement.allowed) {
    return NextResponse.json(
      { error: "AI voice session temporarily limited", code: enforcement.code },
      { status: 429 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const model = getOpenAILiveModel();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Voice service is not configured", code: "realtime_not_configured" },
      { status: 503 },
    );
  }

  let body: LiveSessionRequest;
  try {
    body = (await request.json()) as LiveSessionRequest;
  } catch {
    return NextResponse.json(
      { error: "Invalid voice session request", code: "live_invalid_request" },
      { status: 400 },
    );
  }

  const sdp = typeof body.sdp === "string" ? body.sdp.trim() : "";
  if (!sdp) {
    return NextResponse.json(
      { error: "An SDP offer is required", code: "live_missing_sdp" },
      { status: 400 },
    );
  }
  const surface = getLiveSurface(body.surface);

  try {
    const response = await Promise.race([
      fetch("https://api.openai.com/v1/live/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session: {
            model,
            instructions: liveInstructions(surface),
            audio: {
              output: {
                voice: surface === "technician_copilot" ? "vesper" : "marin",
              },
            },
            delegation: { type: "client" },
            store: false,
          },
          transport: {
            type: "webrtc",
            sdp,
          },
        }),
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("AI request timed out")), policy.timeoutMs),
      ),
    ]);

    const rawText = await response.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // handled below
    }

    if (!response.ok || !parsed) {
      console.error("[live-session] OpenAI session creation failed", {
        status: response.status,
        statusText: response.statusText,
      });
      return NextResponse.json(
        {
          error: "Voice service could not start",
          code: "live_session_rejected",
          upstreamStatus: response.status,
        },
        { status: 502 },
      );
    }

    const legacyEstimatedCostUsd = estimateAICostUsd("openai_realtime_token", 1);
    await recordDurableAIUsage({
      feature: "openai_realtime_token",
      endpoint: "/api/openai/realtime-token",
      shop_id: access.profile.shop_id,
      user_id: access.profile.id,
      provider: "openai",
      model,
      modality: "realtime",
      latency_ms: Date.now() - startedAt,
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null,
      estimated_cost_usd: 0,
      status: "success",
      error_code: null,
      error_message: null,
    });
    registerAIUsageEvent({
      feature: "openai_realtime_token",
      endpoint: "/api/openai/realtime-token",
      shopId: access.profile.shop_id,
      model,
      totalTokens: 1,
      estimatedCostUsd: legacyEstimatedCostUsd,
      status: "success",
      errorCode: null,
    });

    return NextResponse.json(parsed, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Unhandled live session error";
    await recordDurableAIUsage({
      feature: "openai_realtime_token",
      endpoint: "/api/openai/realtime-token",
      shop_id: access.profile.shop_id,
      user_id: access.profile.id,
      provider: "openai",
      model,
      modality: "realtime",
      latency_ms: Date.now() - startedAt,
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null,
      estimated_cost_usd: 0,
      status: "error",
      error_code: "live_session_error",
      error_message: message,
    });
    registerAIUsageEvent({
      feature: "openai_realtime_token",
      endpoint: "/api/openai/realtime-token",
      shopId: access.profile.shop_id,
      model,
      totalTokens: null,
      estimatedCostUsd: 0,
      status: "error",
      errorCode: "live_session_error",
    });

    const timedOut = message === "AI request timed out";
    return NextResponse.json(
      {
        error: timedOut
          ? "Voice service took too long to respond"
          : "Voice service could not start",
        code: timedOut ? "realtime_upstream_timeout" : "live_session_error",
      },
      { status: timedOut ? 504 : 500 },
    );
  }
}
