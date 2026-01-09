// app/api/ai/summarize-stats/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY ?? "";

const openai = new OpenAI({ apiKey });

export async function POST(req: Request) {
  if (!apiKey) {
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
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
  });

  return NextResponse.json({
    summary: res.choices[0]?.message?.content ?? "",
  });
}