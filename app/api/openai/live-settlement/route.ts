import { NextRequest, NextResponse } from "next/server";

import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { estimateOpenAILiveCostUsd } from "@/features/shared/lib/server/ai-cost";
import { getOpenAILiveModel } from "@/features/shared/lib/openai-realtime-models";
import { settleAIUsageReservation } from "@/features/shared/lib/server/ai-ops-guard";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LIVE_SECONDS = 10 * 60;

type SettlementBody = {
  sessionId?: unknown;
  usageSeconds?: unknown;
};

type SettlementRpc = {
  settled?: unknown;
  alreadySettled?: unknown;
  previousCostUsd?: unknown;
  actualCostUsd?: unknown;
  durationSeconds?: unknown;
};

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function POST(request: NextRequest) {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;

  let body: SettlementBody;
  try {
    body = (await request.json()) as SettlementBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid Live usage settlement", code: "live_settlement_invalid" },
      { status: 400 },
    );
  }

  const sessionId =
    typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  const rawSeconds = finiteNumber(body.usageSeconds);
  if (!sessionId || rawSeconds == null || rawSeconds < 0) {
    return NextResponse.json(
      { error: "Invalid Live usage settlement", code: "live_settlement_invalid" },
      { status: 400 },
    );
  }

  const usageSeconds = Math.min(MAX_LIVE_SECONDS, rawSeconds);
  const model = getOpenAILiveModel();
  const actualCostUsd = estimateOpenAILiveCostUsd(model, usageSeconds);
  if (actualCostUsd == null) {
    return NextResponse.json(
      { error: "Live pricing is not configured", code: "live_rate_not_configured" },
      { status: 503 },
    );
  }

  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc("settle_live_ai_usage_ledger", {
    p_shop_id: access.profile.shop_id,
    p_user_id: access.profile.id,
    p_session_id: sessionId,
    p_duration_seconds: usageSeconds,
    p_actual_cost_usd: actualCostUsd,
  });

  if (error) {
    const notFound =
      error.message?.includes("LIVE_USAGE_RESERVATION_NOT_FOUND") ?? false;
    console.error("[live-settlement] settlement failed", {
      code: error.code ?? null,
      sessionId,
      notFound,
    });
    return NextResponse.json(
      {
        error: notFound
          ? "Live session reservation could not be verified"
          : "Live usage could not be settled",
        code: notFound
          ? "live_settlement_not_found"
          : "live_settlement_failed",
      },
      { status: notFound ? 403 : 500 },
    );
  }

  const result = (data ?? {}) as SettlementRpc;
  const previousCostUsd = finiteNumber(result.previousCostUsd);
  const settledCostUsd = finiteNumber(result.actualCostUsd);

  if (
    result.alreadySettled !== true &&
    previousCostUsd != null &&
    settledCostUsd != null
  ) {
    settleAIUsageReservation({
      feature: "openai_realtime_token",
      shopId: access.profile.shop_id,
      reservedCostUsd: previousCostUsd,
      actualCostUsd: settledCostUsd,
    });
  }

  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
