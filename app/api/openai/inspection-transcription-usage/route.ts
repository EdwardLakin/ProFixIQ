import { NextRequest, NextResponse } from "next/server";

import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  usageKey?: unknown;
  durationSeconds?: unknown;
};

type SettlementResult = {
  settled?: unknown;
  alreadySettled?: unknown;
  actualCostUsd?: unknown;
  durationSeconds?: unknown;
};

type SessionReceipt = {
  shopId?: unknown;
  model?: unknown;
  callId?: unknown;
  durationSeconds?: unknown;
  operation?: unknown;
  rateCardVersion?: unknown;
  reservedCostUsd?: unknown;
};

type SettlementClient = {
  rpc(
    name: "get_inspection_voice_session_receipt_for_actor",
    args: Record<string, unknown>,
  ): PromiseLike<{
    data: SessionReceipt | null;
    error: { message?: string; code?: string | null } | null;
  }>;
  rpc(
    name: "settle_inspection_voice_usage",
    args: Record<string, unknown>,
  ): PromiseLike<{
    data: SettlementResult | null;
    error: { message?: string; code?: string | null } | null;
  }>;
  rpc(
    name: "confirm_inspection_voice_closure",
    args: Record<string, unknown>,
  ): PromiseLike<{
    data: number | null;
    error: { message?: string; code?: string | null } | null;
  }>;
};

export async function POST(request: NextRequest) {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid usage payload" }, { status: 400 });
  }

  const usageKey =
    typeof body.usageKey === "string" ? body.usageKey.trim() : "";
  const rawSeconds =
    typeof body.durationSeconds === "number" && Number.isFinite(body.durationSeconds)
      ? body.durationSeconds
      : null;
  if (
    !/^[0-9a-f-]{36}$/i.test(usageKey) ||
    rawSeconds == null ||
    rawSeconds < 0
  ) {
    return NextResponse.json({ error: "Invalid usage payload" }, { status: 400 });
  }

  const admin = createAdminSupabase() as unknown as SettlementClient;
  const { data: receipt, error: modelError } = await admin.rpc(
    "get_inspection_voice_session_receipt_for_actor",
    {
      p_user_id: access.profile.id,
      p_usage_key: usageKey,
    },
  );
  if (modelError || !receipt) {
    const notFound =
      modelError?.message?.includes("INSPECTION_VOICE_RESERVATION_NOT_FOUND") ??
      false;
    console.warn("[inspection-voice] usage reservation lookup failed", {
      code: modelError?.code ?? null,
      notFound,
    });
    return NextResponse.json(
      {
        error: notFound
          ? "Inspection voice reservation could not be verified"
          : "Inspection voice reservation lookup is temporarily unavailable",
        code: notFound
          ? "inspection_voice_settlement_not_found"
          : "inspection_voice_settlement_unavailable",
      },
      { status: notFound ? 403 : 503 },
    );
  }

  if (receipt.operation === "inspection_transcription_rejected") {
    return new NextResponse(null, { status: 204 });
  }

  const transcriptionModel = typeof receipt.model === "string" ? receipt.model : "";
  const issuanceShopId = typeof receipt.shopId === "string" ? receipt.shopId : "";
  const callId = typeof receipt.callId === "string" ? receipt.callId : "";
  if (!issuanceShopId || !transcriptionModel || !/^rtc_[a-zA-Z0-9_-]+$/.test(callId)) {
    return NextResponse.json(
      { error: "Inspection voice call receipt is unavailable", code: "inspection_voice_closure_unavailable" },
      { status: 503 },
    );
  }
  if (receipt.operation === "inspection_transcription_settled" ||
      receipt.operation === "inspection_transcription_settled_fallback") {
    return new NextResponse(null, { status: 204 });
  }

  let durationSeconds: number;
  if (receipt.operation === "inspection_transcription_closed") {
    durationSeconds = Number(receipt.durationSeconds);
  } else {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Inspection voice closure is unavailable", code: "inspection_voice_closure_unavailable" },
        { status: 503 },
      );
    }
    let closedAt: string;
    try {
      const closure = await fetch(`https://api.openai.com/v1/realtime/calls/${callId}/hangup`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!closure.ok) {
        console.warn("[inspection-voice] provider closure unconfirmed", { status: closure.status });
        return NextResponse.json(
          { error: "Inspection voice closure could not be confirmed", code: "inspection_voice_closure_unavailable" },
          { status: 503 },
        );
      }
      closedAt = new Date().toISOString();
    } catch {
      return NextResponse.json(
        { error: "Inspection voice closure could not be confirmed", code: "inspection_voice_closure_unavailable" },
        { status: 503 },
      );
    }
    const closure = await admin.rpc("confirm_inspection_voice_closure", {
      p_shop_id: issuanceShopId,
      p_user_id: access.profile.id,
      p_usage_key: usageKey,
      p_call_id: callId,
      p_closed_at: closedAt,
    });
    if (closure.error || closure.data == null) {
      return NextResponse.json(
        { error: "Inspection voice closure could not be recorded", code: "inspection_voice_closure_unavailable" },
        { status: 503 },
      );
    }
    durationSeconds = Number(closure.data);
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0 || durationSeconds > 3600) {
    return NextResponse.json(
      { error: "Inspection voice duration is unavailable", code: "inspection_voice_closure_unavailable" },
      { status: 503 },
    );
  }

  const reservedCostUsd = Number(receipt.reservedCostUsd);
  if (typeof receipt.rateCardVersion !== "string" || !receipt.rateCardVersion ||
      !Number.isFinite(reservedCostUsd) || reservedCostUsd <= 0) {
    return NextResponse.json(
      { error: "Inspection voice issuance pricing is unavailable", code: "inspection_voice_rate_not_configured" },
      { status: 422 },
    );
  }
  // Every issued inspection call reserves exactly 3600 seconds. The immutable
  // issuance ceiling pins this session's rate across pricing deployments.
  const estimatedCostUsd = Number((reservedCostUsd * durationSeconds / 3600).toFixed(8));

  const { data, error } = await admin.rpc("settle_inspection_voice_usage", {
    p_shop_id: issuanceShopId,
    p_user_id: access.profile.id,
    p_usage_key: usageKey,
    p_model: transcriptionModel,
    p_duration_seconds: durationSeconds,
    p_actual_cost_usd: estimatedCostUsd,
  });

  if (error) {
    const notFound =
      error.message?.includes("INSPECTION_VOICE_RESERVATION_NOT_FOUND") ??
      error.message?.includes("INSPECTION_VOICE_BUDGET_RESERVATION_NOT_FOUND") ??
      false;
    const mismatch =
      error.message?.includes("INSPECTION_VOICE_MODEL_MISMATCH") ?? false;
    console.error("[inspection-voice] settlement failed", {
      code: error.code ?? null,
      notFound,
      mismatch,
    });
    return NextResponse.json(
      {
        error: notFound
          ? "Inspection voice reservation could not be verified"
          : mismatch
            ? "Inspection voice model did not match its reservation"
            : "Inspection voice usage could not be settled",
        code: notFound
          ? "inspection_voice_settlement_not_found"
          : mismatch
            ? "inspection_voice_model_mismatch"
            : "inspection_voice_settlement_failed",
      },
      { status: notFound ? 403 : mismatch ? 409 : 500 },
    );
  }

  if (data?.settled !== true) {
    console.error("[inspection-voice] settlement returned no result", {
      shopId: issuanceShopId,
    });
    return NextResponse.json(
      { error: "Inspection voice usage could not be settled", code: "inspection_voice_settlement_failed" },
      { status: 500 },
    );
  }

  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
