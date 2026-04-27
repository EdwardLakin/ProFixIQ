// app/api/ai/summarize-stats/route.ts
import { NextResponse } from "next/server";
import { getOpenAIClient, isOpenAIConfigured } from "@/features/shared/lib/server/openai";
import { getOpenAIModelForPurpose } from "@/features/shared/lib/server/openai-models";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

const openai = isOpenAIConfigured() ? getOpenAIClient() : null;

export async function POST(req: Request) {
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

  const res = await openai.chat.completions.create({
    model: getOpenAIModelForPurpose("fast"),
    messages: [{ role: "user", content: prompt }],
  });

  return NextResponse.json({
    summary: res.choices[0]?.message?.content ?? "",
  });
}
