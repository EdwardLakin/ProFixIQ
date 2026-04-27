// features/ai/api/stats/summarize/route.ts
import { NextResponse } from "next/server";
import { getOpenAIClient, isOpenAIConfigured } from "@/features/shared/lib/server/openai";
import { getOpenAIModelForPurpose } from "@/features/shared/lib/server/openai-models";

if (!isOpenAIConfigured()) {
  // Don’t throw at import-time in Next; return a clean error on request.
  // eslint-disable-next-line no-console
  console.warn("[summarize-stats] OPENAI_API_KEY is not set");
}

const openai = isOpenAIConfigured() ? getOpenAIClient() : null;

type SummarizeBody = {
  timeRange?: string;
  stats?: unknown;
};

export async function POST(req: Request) {
  try {
    if (!openai) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not set" },
        { status: 500 },
      );
    }

    const body = (await req.json().catch(() => null)) as SummarizeBody | null;
    const timeRange = body?.timeRange ?? "unknown";
    const stats = body?.stats;

    if (!stats || typeof stats !== "object") {
      return NextResponse.json(
        { error: "Invalid stats payload" },
        { status: 400 },
      );
    }

    const prompt = `
You are an assistant helping auto repair shops summarize their performance metrics.
Write a professional and concise summary based on these KPIs for the selected period (${timeRange}):

Stats:
${JSON.stringify(stats, null, 2)}

Include insights like revenue trends, labor efficiency, job volume, profitability, and areas for improvement.
Output in paragraph form.
`.trim();

    const response = await openai.chat.completions.create({
      model: getOpenAIModelForPurpose("reasoning"),
      temperature: 0.7,
      messages: [{ role: "user", content: prompt }],
    });

    const message = response.choices[0]?.message?.content ?? "";
    return NextResponse.json({ summary: message });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // eslint-disable-next-line no-console
    console.error("Summary generation error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}