//features/ai/api/stats/summarize/route.ts

import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { timeRange, stats } = body;

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

Include insights like revenue trends, labor efficiency, job volume, profitability, and areas for improvement. Output in paragraph form.
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.7,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const message = response.choices[0]?.message?.content ?? "";
    return NextResponse.json({ summary: message });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Summary generation error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
