// app/api/ai/quote-suggest/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY! // service key so we can log ai runs
);

// Keep the response structured and easy to consume
type AISuggestion = {
  parts: { name: string; qty?: number; cost?: number; notes?: string }[];
  laborHours: number;
  laborRate?: number;
  summary: string;
  confidence?: "low" | "medium" | "high";
};

export async function POST(req: Request) {
  try {
    const { item, notes, section, status } = await req.json();

    const system = `You are a repair estimator for commercial vehicles.
Return ONLY a compact JSON object with keys:
- parts: array of { name, qty?, cost?, notes? }
- laborHours: number
- laborRate?: number
- summary: short plain text (max 160 chars)
- confidence?: "low"|"medium"|"high"
No extra prose.`;

    const user = `
Status: ${status}
Section: ${section}
Item: ${item}
Tech notes: ${notes || "none"}

Vehicle context unknown; suggest a reasonable baseline.
Prefer concise, realistic parts and labor.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    let suggestion: AISuggestion;
    try {
      suggestion = JSON.parse(raw) as AISuggestion;
    } catch {
      suggestion = { parts: [], laborHours: 0.5, summary: "No suggestion." };
    }

    // Optional: persist the AI call (handy for QA/audit)
    await supabase.from("ai_requests").insert({
      kind: "quote_suggestion",
      input_text: user,
      output_text: raw,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({ suggestion });
  } catch (err) {
    console.error("quote-suggest error:", err);
    return NextResponse.json({ error: "AI suggestion failed" }, { status: 500 });
  }
}