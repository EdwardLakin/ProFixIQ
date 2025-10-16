// /app/api/ai/quote-suggest/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

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

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      console.error("Missing OPENAI_API_KEY");
      return NextResponse.json(
        { error: "Server not configured (OpenAI)" },
        { status: 500 }
      );
    }

    const openai = new OpenAI({ apiKey: openaiApiKey });

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

    // --- Optional: persist the AI call (skip if envs are missing) ---
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

    if (supabaseUrl && supabaseKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey);
        await supabase.from("ai_requests").insert({
          kind: "quote_suggestion",
          input_text: user,
          output_text: raw,
          created_at: new Date().toISOString(),
        });
      } catch (e) {
        // Log but don't fail the route
        console.warn("Supabase logging failed:", e);
      }
    } else {
      // Don’t crash the build or request if Supabase is not configured
      console.warn("Skipping Supabase logging; credentials not provided.");
    }

    return NextResponse.json({ suggestion });
  } catch (err) {
    console.error("quote-suggest error:", err);
    return NextResponse.json({ error: "AI suggestion failed" }, { status: 500 });
  }
}