import { NextResponse } from "next/server";

import { isAgentApiRequestAuthorized } from "@/features/shared/lib/server/agent-api-secrets";
import { AI_RATE_CARD_VERSION } from "@/features/shared/lib/server/ai-cost";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AgentUsagePayload = {
  event_key?: string;
  feature?: string;
  endpoint?: string;
  provider?: string;
  model?: string | null;
  modality?: string;
  prompt_tokens?: number | null;
  cached_prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
  estimated_cost_usd?: number | null;
  latency_ms?: number | null;
  status?: string;
  error_code?: string | null;
  error_message?: string | null;
  provider_request_id?: string | null;
  occurred_at?: string | null;
  agent_run_id?: string | null;
  external_request_id?: string | null;
  operation?: string | null;
};

function boundedText(value: unknown, max: number): string | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new Error("invalid_text");
  const out = value.trim();
  if (!out) return null;
  if (out.length > max) throw new Error("text_too_long");
  return out;
}

function optionalNonNegativeNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("invalid_metric");
  return parsed;
}

function boundedOccurredAt(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string" || !value.trim()) throw new Error("invalid_occurred_at");
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error("invalid_occurred_at");
  if (parsed.getTime() > Date.now() + 5 * 60_000) throw new Error("future_occurred_at");
  return parsed.toISOString();
}

export async function POST(request: Request) {
  if (!isAgentApiRequestAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 64 * 1024) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const body = await request.json().catch(() => null) as AgentUsagePayload | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const eventKey = boundedText(body.event_key, 240);
    const feature = boundedText(body.feature, 120);
    const endpoint = boundedText(body.endpoint, 240);
    const status = body.status === "error"
      ? "error"
      : body.status === "success"
        ? "success"
        : null;

    if (!eventKey || !feature || !endpoint || !status) {
      return NextResponse.json(
        { error: "event_key, feature, endpoint and status are required" },
        { status: 400 },
      );
    }

    const payload = {
      event_key: eventKey,
      feature,
      endpoint,
      provider: boundedText(body.provider, 40) ?? "openai",
      model: boundedText(body.model, 120),
      modality: boundedText(body.modality, 30) ?? "text",
      rate_card_version: AI_RATE_CARD_VERSION,
      prompt_tokens: optionalNonNegativeNumber(body.prompt_tokens),
      cached_prompt_tokens: optionalNonNegativeNumber(body.cached_prompt_tokens),
      completion_tokens: optionalNonNegativeNumber(body.completion_tokens),
      total_tokens: optionalNonNegativeNumber(body.total_tokens),
      estimated_cost_usd: optionalNonNegativeNumber(body.estimated_cost_usd),
      latency_ms: Math.round(optionalNonNegativeNumber(body.latency_ms) ?? 0),
      status,
      error_code: boundedText(body.error_code, 120),
      error_message: boundedText(body.error_message, 500),
      provider_request_id: boundedText(body.provider_request_id, 240),
      occurred_at: boundedOccurredAt(body.occurred_at),
      agent_run_id: boundedText(body.agent_run_id, 240),
      external_request_id: boundedText(body.external_request_id, 240),
      operation: boundedText(body.operation, 160),
    };

    const admin = createAdminSupabase();
    const { data, error } = await admin.rpc(
      "record_engineering_agent_ai_usage_ledger",
      { p_payload: payload },
    );

    if (error) {
      console.error("[agent-ai-usage] ledger write failed", error);
      return NextResponse.json({ error: "Usage write failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data });
  } catch (error) {
    const code = error instanceof Error ? error.message : "invalid_payload";
    return NextResponse.json({ error: code }, { status: 400 });
  }
}
