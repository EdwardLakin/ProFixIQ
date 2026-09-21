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
  latency_ms?: number;
  status?: string;
  error_code?: string | null;
  error_message?: string | null;
  provider_request_id?: string | null;
  occurred_at?: string | null;
  agent_run_id?: string | null;
  external_request_id?: string | null;
  operation?: string | null;
};

function text(value: unknown, max: number): string | null {
  const out = typeof value === "string" ? value.trim() : "";
  return out ? out.slice(0, max) : null;
}

function nonNegativeNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
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

  const feature = text(body.feature, 120);
  const endpoint = text(body.endpoint, 240);
  const eventKey = text(body.event_key, 240);
  const status = body.status === "error" ? "error" : body.status === "success" ? "success" : null;

  if (!feature || !endpoint || !eventKey || !status) {
    return NextResponse.json(
      { error: "event_key, feature, endpoint and status are required" },
      { status: 400 },
    );
  }

  const admin = createAdminSupabase() as unknown as {
    rpc: (
      name: "record_ai_usage_ledger",
      args: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };

  const result = await Promise.resolve(admin.rpc("record_ai_usage_ledger", {
    p_shop_id: null,
    p_user_id: null,
    p_payload: {
      event_key: eventKey,
      feature,
      endpoint,
      provider: text(body.provider, 40) ?? "openai",
      model: text(body.model, 120),
      modality: text(body.modality, 30) ?? "text",
      rate_card_version: AI_RATE_CARD_VERSION,
      prompt_tokens: nonNegativeNumber(body.prompt_tokens),
      cached_prompt_tokens: nonNegativeNumber(body.cached_prompt_tokens),
      completion_tokens: nonNegativeNumber(body.completion_tokens),
      total_tokens: nonNegativeNumber(body.total_tokens),
      estimated_cost_usd: nonNegativeNumber(body.estimated_cost_usd),
      latency_ms: Math.round(nonNegativeNumber(body.latency_ms) ?? 0),
      status,
      error_code: text(body.error_code, 120),
      error_message: text(body.error_message, 500),
      provider_request_id: text(body.provider_request_id, 240),
      occurred_at: text(body.occurred_at, 80),
      source_product: "engineering_agent",
      agent_run_id: text(body.agent_run_id, 240),
      external_request_id: text(body.external_request_id, 240),
      operation: text(body.operation, 160),
    },
  }));

  if (result.error) {
    console.error("[agent-ai-usage] ledger write failed", result.error);
    return NextResponse.json({ error: "Usage write failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: result.data });
}
