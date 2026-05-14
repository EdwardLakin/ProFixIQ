// app/api/ai/summarize-stats/route.ts
import { NextResponse } from "next/server";
import { getOpenAIClient, isOpenAIConfigured } from "@/features/shared/lib/server/openai";
import { getOpenAIModelForPurpose } from "@/features/shared/lib/server/openai-models";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { getAIPolicy } from "@/features/shared/lib/server/ai-policy";
import { recordAITelemetry } from "@/features/shared/lib/server/ai-telemetry";

const openai = isOpenAIConfigured() ? getOpenAIClient() : null;

export async function POST(req: Request) {
  const startedAt = Date.now();
  const policy = getAIPolicy("ai_summarize_stats");
  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!openai) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not set" },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body?.stats || typeof body.stats !== "object") {
    return NextResponse.json(
      { error: "Invalid stats payload" },
      { status: 400 }
    );
  }

  const prompt = `
Summarize the following shop performance stats:

${JSON.stringify(body.stats, null, 2)}
`;

  const model = getOpenAIModelForPurpose(policy.modelPurpose);

  try {
    const res = await Promise.race([
      openai.chat.completions.create({
        model,
        max_tokens: policy.maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("AI request timed out")), policy.timeoutMs),
      ),
    ]);

    recordAITelemetry({
      feature: "ai_summarize_stats",
      endpoint: "/api/ai/summarize-stats",
      shop_id: null,
      user_id: user.id,
      model,
      latency_ms: Date.now() - startedAt,
      prompt_tokens: res.usage?.prompt_tokens ?? null,
      completion_tokens: res.usage?.completion_tokens ?? null,
      total_tokens: res.usage?.total_tokens ?? null,
      status: "success",
      error_code: null,
      error_message: null,
    });

    return NextResponse.json({
      summary: res.choices[0]?.message?.content ?? "",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI summary failed";
    recordAITelemetry({
      feature: "ai_summarize_stats",
      endpoint: "/api/ai/summarize-stats",
      shop_id: null,
      user_id: user.id,
      model,
      latency_ms: Date.now() - startedAt,
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null,
      status: "error",
      error_code: "ai_summary_error",
      error_message: message,
    });

    if (policy.fallbackMode === "graceful_empty") {
      return NextResponse.json({ summary: "" });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
