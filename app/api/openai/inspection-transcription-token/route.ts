import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { AI_RATE_CARD_VERSION, estimateOpenAIInspectionTranscriptionCostUsd } from "@/features/shared/lib/server/ai-cost";
import {
  AIBudgetDeniedError,
  AIBudgetReplayError,
  AIBudgetUnavailableError,
  aiBudgetPoolForFeature,
  releaseAIBudget,
  reserveAIBudget,
} from "@/features/shared/lib/server/ai-budget";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { getOpenAIInspectionTranscriptionModel } from "@/features/shared/lib/openai-realtime-models";
import { getAIPolicy } from "@/features/shared/lib/server/ai-policy";
import { recordDurableAIUsage } from "@/features/shared/lib/server/ai-telemetry";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SDP_LENGTH = 64 * 1024;
const MAX_SESSION_SECONDS = 60 * 60;
const TRANSCRIPTION_FEATURE = "openai_realtime_token" as const;
const OPERATION_KEY_HEADER = "x-profixiq-operation-key";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CALL_LOCATION_PATTERN = /^\/v1\/realtime\/calls\/(rtc_[a-zA-Z0-9_-]+)$/;

type SessionRequest = {
  sdp?: unknown;
};

function inspectionSession(model: string) {
  return {
    type: "transcription",
    audio: {
      input: {
        noise_reduction: { type: "near_field" },
        transcription: {
          model,
          languages: ["en"],
          delay: "low",
          prompt:
            "Vehicle inspection in a repair shop. Expect automotive and heavy-duty terminology, measurements, brake readings, tire tread depths, defects, pass, fail, recommend, and component names.",
        },
        turn_detection: null,
      },
    },
  };
}

// A read-only authorization/configuration check precedes browser microphone
// permission. No reservation or provider call is made by this request.
export async function GET(request: Request) {
  const access = await requireShopScopedApiAccess({ requiredCapability: "canRunInspections" });
  if (!access.ok) return access.response;
  // Bundles loaded before this transport cutover request an ephemeral client
  // secret here. That path has no server-known call ID and cannot be settled
  // safely. Tell the existing UI to refresh rather than issuing an untracked call.
  if (new URL(request.url).searchParams.get("protocol") !== "server-webrtc") {
    return NextResponse.json({
      error: "Inspection voice was updated. Refresh this inspection page to continue.",
      code: "inspection_voice_refresh_required",
    }, { status: 426, headers: { "Cache-Control": "no-store" } });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "Inspection voice is not configured" }, { status: 503 });
  }
  if (estimateOpenAIInspectionTranscriptionCostUsd(
    getOpenAIInspectionTranscriptionModel(), MAX_SESSION_SECONDS,
  ) == null) {
    return NextResponse.json({ error: "Inspection voice pricing is not configured" }, { status: 503 });
  }
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canRunInspections",
  });
  if (!access.ok) return access.response;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "Inspection voice is not configured",
        code: "inspection_voice_not_configured",
      },
      { status: 503 },
    );
  }

  const body = (await request
    .json()
    .catch(() => null)) as SessionRequest | null;
  const sdp = typeof body?.sdp === "string" ? body.sdp.trim() : "";
  if (!sdp.startsWith("v=0") || sdp.length > MAX_SDP_LENGTH) {
    return NextResponse.json(
      {
        error: "A valid inspection voice offer is required",
        code: "inspection_voice_invalid_offer",
      },
      { status: 400 },
    );
  }

  const model = getOpenAIInspectionTranscriptionModel();
  const policy = getAIPolicy("openai_realtime_token");
  const requestedKey = request.headers.get(OPERATION_KEY_HEADER)?.trim() ?? "";
  const usageKey = UUID_PATTERN.test(requestedKey)
    ? requestedKey
    : randomUUID();
  const eventKey = `inspection_voice:${access.profile.shop_id}:${usageKey}`;
  const reservedCostUsd = estimateOpenAIInspectionTranscriptionCostUsd(
    model,
    MAX_SESSION_SECONDS,
  );
  if (reservedCostUsd == null) {
    return NextResponse.json(
      {
        error: "Inspection voice pricing is not configured",
        code: "inspection_voice_rate_not_configured",
      },
      { status: 503 },
    );
  }

  let reservationId: string | null = null;
    try {
      const reservation = await reserveAIBudget({
        admin: createAdminSupabase(),
        shopId: access.profile.shop_id,
        actorId: access.profile.id,
        feature: TRANSCRIPTION_FEATURE,
        pool: aiBudgetPoolForFeature(TRANSCRIPTION_FEATURE),
        amountUsd: reservedCostUsd,
        idempotencyKey: eventKey,
        ttlSeconds: MAX_SESSION_SECONDS,
      });
      reservationId = reservation.reservationId;
      if (reservation.wouldDeny) {
        console.warn("ai_budget_shadow_would_deny", {
          feature: TRANSCRIPTION_FEATURE,
          shopId: access.profile.shop_id,
          reason: reservation.reason,
          holdUsd: reservedCostUsd,
        });
      }
    } catch (caught) {
      if (caught instanceof AIBudgetDeniedError) {
        return NextResponse.json(
          {
            error:
              caught.reason === "pool_cap_exceeded"
                ? "This shop has reached its AI limit for this feature."
                : "This shop's AI budget is used up.",
            code: "ai_budget_exceeded",
            reason: caught.reason,
          },
          { status: 402 },
        );
      }
      if (caught instanceof AIBudgetReplayError) {
        return NextResponse.json(
          {
            error: "Inspection voice session was already reserved",
            code: caught.decision === "released"
              ? "inspection_voice_reservation_released"
              : "inspection_voice_reservation_replayed",
          },
          { status: 409 },
        );
      }
      console.error("[inspection-voice] budget reservation unavailable", {
        shopId: access.profile.shop_id,
        code: caught instanceof AIBudgetUnavailableError ? caught.code : "unexpected_error",
      });
      return NextResponse.json(
        { error: "Inspection voice budget could not be verified", code: "inspection_voice_budget_unavailable" },
        { status: 503 },
      );
    }

  if (!reservationId) {
    return NextResponse.json(
      { error: "Inspection voice budget could not be verified", code: "inspection_voice_budget_unavailable" },
      { status: 503 },
    );
  }
  const releaseReservation = async () => {
    if (!reservationId) return true;
    return releaseAIBudget({
      admin: createAdminSupabase(),
      shopId: access.profile.shop_id,
      reservationId,
    });
  };
  const recordTokenError = async (code: string, message: string) => {
    const result = await recordDurableAIUsage({
      event_key: `${eventKey}:error`,
      feature: TRANSCRIPTION_FEATURE,
      endpoint: "/api/openai/inspection-transcription-token",
      shop_id: access.profile.shop_id,
      user_id: access.profile.id,
      provider: "openai",
      model,
      modality: "realtime",
      duration_seconds: 0,
      estimated_cost_usd: 0,
      latency_ms: Date.now() - startedAt,
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null,
      quota_receipt_id: reservationId,
      status: "error",
      error_code: code,
      error_message: message,
      operation: "inspection_transcription_creation",
    });
    return result.persisted;
  };
  try {
    const { data, error } = await createAdminSupabase().rpc(
      "record_inspection_voice_issuance_rate",
      {
        p_shop_id: access.profile.shop_id,
        p_actor_id: access.profile.id,
        p_reservation_id: reservationId,
        p_rate_card_version: AI_RATE_CARD_VERSION,
      },
    );
    if (error || data !== true) throw new Error("Inspection voice rate receipt unavailable");
  } catch {
    // The provider was never called. Keep durable proof of that fact if the
    // immediate budget release fails, so stale recovery can release at zero.
    const recorded = await recordTokenError(
      "inspection_voice_pre_provider_failure", "rate_receipt_unavailable",
    ) || await recordTokenError(
      "inspection_voice_pre_provider_failure", "rate_receipt_unavailable",
    );
    const released = await releaseReservation();
    if (!recorded && !released) {
      console.error("[inspection-voice] pre-provider failure could not be reconciled", {
        shopId: access.profile.shop_id, reservationId,
      });
    }
    return NextResponse.json(
      { error: "Inspection voice budget could not be verified", code: "inspection_voice_rate_receipt_unavailable" },
      { status: 503 },
    );
  }
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let providerMayHaveCreatedSession = false;

  try {
    const form = new FormData();
    form.set("sdp", sdp);
    form.set("session", JSON.stringify(inspectionSession(model)));

    providerMayHaveCreatedSession = true;
    const response = await Promise.race([
      fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: controller.signal,
      }),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          reject(new Error("AI request timed out"));
        }, policy.timeoutMs);
      }),
    ]);

    if (!response.ok) {
      if (![400, 401, 403, 404, 409, 422, 429].includes(response.status)) {
        throw new Error(`upstream_status_${response.status}`);
      }
      providerMayHaveCreatedSession = false;
      const errorCode = "inspection_voice_rejected";
      const message = `upstream_status_${response.status}`;
      // Persist the definitive provider rejection first. If budget release
      // fails, stale reconciliation can safely release this specific hold.
      const recorded = await recordTokenError(errorCode, message) ||
        await recordTokenError(errorCode, message);
      const released = await releaseReservation();
      if (!released && !recorded) {
        console.error("[inspection-voice] definite rejection could not be reconciled", {
          shopId: access.profile.shop_id, reservationId,
        });
      }
      return NextResponse.json(
        {
          error: "Inspection voice could not start",
          code: "inspection_voice_rejected",
        },
        { status: 502 },
      );
    }
    const issuedAt = new Date().toISOString();
    const callId = CALL_LOCATION_PATTERN.exec(response.headers.get("location") ?? "")?.[1] ?? null;
    // A 2xx provider response can create a billable call even if its body fails.
    const answerSdp = await response.text().catch(() => "");
    const telemetryEvent = {
      event_key: eventKey,
      feature: TRANSCRIPTION_FEATURE,
      endpoint: "/api/openai/inspection-transcription-token",
      shop_id: access.profile.shop_id,
      user_id: access.profile.id,
      provider: "openai",
      provider_request_id: callId,
      occurred_at: issuedAt,
      model,
      modality: "realtime" as const,
      duration_seconds: MAX_SESSION_SECONDS,
      estimated_cost_usd: reservedCostUsd,
      latency_ms: Date.now() - startedAt,
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null,
      quota_receipt_id: reservationId,
      status: "success" as const,
      error_code: null,
      error_message: null,
      operation: "inspection_transcription_reservation",
    };
    const closeUndeliveredCall = async (receiptPersisted: boolean) => {
      if (!callId) return;
      try {
        const hangup = await fetch(`https://api.openai.com/v1/realtime/calls/${callId}/hangup`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        });
        if (!hangup.ok) return;
        const closedAt = new Date().toISOString();
        // A temporary ledger outage may resolve after the provider hangup.
        // Otherwise the hold remains for conservative stale reconciliation.
        const persisted = receiptPersisted ||
          (await recordDurableAIUsage(telemetryEvent)).persisted;
        if (!persisted) return;
        const admin = createAdminSupabase();
        const closure = await admin.rpc("confirm_inspection_voice_closure", {
          p_shop_id: access.profile.shop_id,
          p_user_id: access.profile.id,
          p_usage_key: usageKey,
          p_call_id: callId,
          p_closed_at: closedAt,
        });
        const duration = Number(closure.data);
        if (closure.error || closure.data == null || !Number.isFinite(duration) ||
            duration < 0 || duration > MAX_SESSION_SECONDS) return;
        await admin.rpc("settle_inspection_voice_usage", {
          p_shop_id: access.profile.shop_id,
          p_user_id: access.profile.id,
          p_usage_key: usageKey,
          p_model: model,
          p_duration_seconds: duration,
          p_actual_cost_usd: Number((reservedCostUsd * duration / MAX_SESSION_SECONDS).toFixed(8)),
        });
      } catch {
        // The call was not delivered to the client. Never release its hold
        // unless provider closure and canonical settlement both succeed.
      }
    };
    let telemetry = await recordDurableAIUsage(telemetryEvent);
    if (!telemetry.persisted) telemetry = await recordDurableAIUsage(telemetryEvent);
    if (!telemetry.persisted) {
      await closeUndeliveredCall(false);
      return NextResponse.json(
        { error: "Inspection voice usage could not be recorded", code: "inspection_voice_accounting_unavailable" },
        { status: 503 },
      );
    }
    if (!answerSdp.trim()) {
      await closeUndeliveredCall(true);
      return NextResponse.json(
        {
          error: "Inspection voice returned an invalid session",
          code: "inspection_voice_invalid_response",
        },
        { status: 502 },
      );
    }
    if (!callId) {
      return NextResponse.json(
        { error: "Inspection voice call receipt is unavailable", code: "inspection_voice_call_receipt_missing" },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { sdp: answerSdp, transcriptionModel: model, usageKey },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (caught) {
    if (!providerMayHaveCreatedSession) {
      await releaseReservation();
      const timedOut =
        caught instanceof Error && caught.message === "AI request timed out";
      await recordTokenError(
        timedOut ? "inspection_voice_timeout" : "inspection_voice_error",
        caught instanceof Error ? caught.message : "unknown_error",
      );
      return NextResponse.json(
        {
          error: timedOut
            ? "Inspection voice took too long to connect"
            : "Inspection voice could not start",
          code: timedOut
            ? "inspection_voice_timeout"
            : "inspection_voice_error",
        },
        { status: timedOut ? 504 : 500 },
      );
    }

    // An interrupted provider request may have created a call. Keep the hold
    // and a canonical receipt so stale reconciliation charges its ceiling.
    await recordDurableAIUsage({
      event_key: eventKey, feature: TRANSCRIPTION_FEATURE,
      endpoint: "/api/openai/inspection-transcription-token",
      shop_id: access.profile.shop_id, user_id: access.profile.id,
      provider: "openai", model, modality: "realtime",
      duration_seconds: MAX_SESSION_SECONDS, estimated_cost_usd: reservedCostUsd,
      latency_ms: Date.now() - startedAt, prompt_tokens: null,
      completion_tokens: null, total_tokens: null,
      quota_receipt_id: reservationId, status: "success",
      error_code: null, error_message: null,
      operation: "inspection_transcription_reservation",
    });

    const timedOut = caught instanceof Error && caught.message === "AI request timed out";
    return NextResponse.json(
      { error: timedOut ? "Inspection voice took too long to connect" : "Inspection voice could not start",
        code: timedOut ? "inspection_voice_timeout" : "inspection_voice_error" },
      { status: timedOut ? 504 : 500 },
    );
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
