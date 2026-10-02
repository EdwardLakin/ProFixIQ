import { NextRequest, NextResponse } from "next/server";

import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import {
  estimateOpenAIInspectionTranscriptionCostUsd,
} from "@/features/shared/lib/server/ai-cost";
import { getOpenAIInspectionTranscriptionModel } from "@/features/shared/lib/openai-realtime-models";
import { recordDurableAIUsage } from "@/features/shared/lib/server/ai-telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  usageKey?: unknown;
  durationSeconds?: unknown;
};

export async function POST(request: NextRequest) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canRunInspections",
  });
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
  if (!usageKey || rawSeconds == null || rawSeconds < 0) {
    return NextResponse.json({ error: "Invalid usage payload" }, { status: 400 });
  }

  const durationSeconds = Math.min(60 * 60, rawSeconds);
  const model = getOpenAIInspectionTranscriptionModel();
  const estimatedCostUsd =
    estimateOpenAIInspectionTranscriptionCostUsd(model, durationSeconds);

  await recordDurableAIUsage({
    event_key: `inspection_voice:${usageKey}`,
    feature: "openai_realtime_token",
    endpoint: "/api/openai/inspection-transcription-token",
    shop_id: access.profile.shop_id,
    user_id: access.profile.id,
    provider: "openai",
    model,
    modality: "realtime",
    prompt_tokens: null,
    completion_tokens: null,
    total_tokens: null,
    duration_seconds: durationSeconds,
    estimated_cost_usd: estimatedCostUsd,
    latency_ms: 0,
    status: "success",
    error_code: null,
    error_message: null,
    operation: "inspection_transcription_usage",
  });

  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
