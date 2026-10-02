import { NextRequest, NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import {
  requireTechnicianCopilotAccess,
  TechnicianCopilotAccessError,
} from "@/features/copilot/technician/server/auth";
import { getOpenAILiveModel } from "@/features/shared/lib/openai-realtime-models";
import { getAIPolicy } from "@/features/shared/lib/server/ai-policy";
import { recordDurableAIUsage } from "@/features/shared/lib/server/ai-telemetry";
import {
  enforceAIOperationalPolicy,
  registerAIUsageEvent,
} from "@/features/shared/lib/server/ai-ops-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A browser SDP offer is a few KB; reject anything wildly larger.
const MAX_SDP_BYTES = 64 * 1024;

type LiveSurface = "technician_copilot" | "inspection";

type LiveSessionRequest = {
  sdp?: unknown;
  surface?: unknown;
};

function getLiveSurface(value: unknown): LiveSurface | null {
  if (value === "technician_copilot" || value === "inspection") return value;
  return null;
}

// The browser only needs the SDP answer to finish the WebRTC handshake.
function liveAnswerSdp(parsed: unknown): string | null {
  if (typeof parsed !== "object" || parsed === null) return null;
  const sdp = (parsed as { transport?: { sdp?: unknown } }).transport?.sdp;
  return typeof sdp === "string" && sdp ? sdp : null;
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

// Conservative reservation for the bounded Live session. The browser transport
// caps streaming at ten minutes by default, so charge a configurable maximum
// session proxy into the existing monthly operational budget instead of
// treating every Live connection as the old fixed token-issuance event.
const LIVE_SESSION_RESERVED_COST_USD = envNumber(
  "AI_LIVE_SESSION_RESERVED_COST_USD",
  0.5,
);

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
  const surface = getLiveSurface(body.surface);
  if (!sdp) {
    return NextResponse.json(
      { error: "An SDP offer is required", code: "live_missing_sdp" },
      { status: 400 },
    );
  }
  if (sdp.length > MAX_SDP_BYTES) {
    return NextResponse.json(
      { error: "The SDP offer is too large", code: "live_sdp_too_large" },
      { status: 413 },
    );
  }
  if (!surface) {
    return NextResponse.json(
      { error: "A valid voice surface is required", code: "live_invalid_surface" },
      { status: 400 },
    );
  }

  let shopId: string;
  let userId: string;

  if (surface === "technician_copilot") {
    try {
      const access = await requireTechnicianCopilotAccess();
      if (!access.capabilities.voice) {
        return NextResponse.json(
          {
            error: "Technician CoPilot voice is not enabled.",
            code: "technician_copilot_voice_disabled",
          },
          { status: 404 },
        );
      }
      shopId = access.shopId;
      userId = access.profileId;
    } catch (caught) {
      if (caught instanceof TechnicianCopilotAccessError) {
        return NextResponse.json(
          { error: caught.message, code: caught.code },
          { status: caught.status },
        );
      }
      console.error("[live-session] Technician access check failed", caught);
      return NextResponse.json(
        { error: "Technician CoPilot access could not be verified." },
        { status: 500 },
      );
    }
  } else {
    const access = await requireShopScopedApiAccess({
      requiredCapability: "canRunInspections",
    });
    if (!access.ok) return access.response;
    shopId = access.profile.shop_id;
    userId = access.profile.id;
  }

  const enforcement = enforceAIOperationalPolicy({
    feature: "openai_realtime_token",
    endpoint: "/api/openai/realtime-token",
    shopId,
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
        setTimeout(
          () => reject(new Error("AI request timed out")),
          policy.timeoutMs,
        ),
      ),
    ]);

    const rawText = await response.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // handled below
    }

    if (!response.ok || !liveAnswerSdp(parsed)) {
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

    await recordDurableAIUsage({
      feature: "openai_realtime_token",
      endpoint: "/api/openai/realtime-token",
      shop_id: shopId,
      user_id: userId,
      provider: "openai",
      model,
      modality: "realtime",
      latency_ms: Date.now() - startedAt,
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null,
      duration_seconds: 10 * 60,
      estimated_cost_usd: LIVE_SESSION_RESERVED_COST_USD,
      status: "success",
      error_code: null,
      error_message: null,
      operation: "live_session_reservation",
    });
    registerAIUsageEvent({
      feature: "openai_realtime_token",
      endpoint: "/api/openai/realtime-token",
      shopId,
      model,
      totalTokens: null,
      estimatedCostUsd: LIVE_SESSION_RESERVED_COST_USD,
      status: "success",
      errorCode: null,
    });

    const answerSdp = liveAnswerSdp(parsed) as string;

    return NextResponse.json({ transport: { sdp: answerSdp } }, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (caught) {
    const message =
      caught instanceof Error ? caught.message : "Unhandled live session error";
    await recordDurableAIUsage({
      feature: "openai_realtime_token",
      endpoint: "/api/openai/realtime-token",
      shop_id: shopId,
      user_id: userId,
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
      operation: "live_session_creation",
    });
    registerAIUsageEvent({
      feature: "openai_realtime_token",
      endpoint: "/api/openai/realtime-token",
      shopId,
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
