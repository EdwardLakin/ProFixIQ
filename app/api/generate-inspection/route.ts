// app/api/generate-inspection/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { toInspectionCategories } from "@/features/inspections/lib/inspection/normalize";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type GenerateBody = {
  prompt?: string;
};

export async function POST(req: Request) {
  try {
    const body: GenerateBody = await req.json();
    const prompt = body.prompt?.trim();
    if (!prompt) {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    const system =
      "You generate automotive inspection templates. " +
      "Return ONLY valid JSON with this shape: " +
      '{"categories":[{"title":string,"items":[{"item":string}]}]} ' +
      "The list should be practical and shop-usable. No extra keys, no markdown.";

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content ?? "{}";
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      data = {};
    }

    const categories = toInspectionCategories(data);
    return NextResponse.json({ categories });
  } catch (err) {
    console.error("generate-inspection error:", err);
    return NextResponse.json({ categories: [] }, { status: 500 });
  }
}