// app/api/assistant/export/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Vehicle = { year: string; make: string; model: string };

type ParsedSummary = {
  cause: string;
  correction: string;
  estimatedLaborTime: number | null;
};

// Lazily create admin client at REQUEST time (not import time)
function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Supabase URL or Service Role key is missing");
  }
  return createClient<Database>(url, serviceKey);
}

function isParsedSummary(v: any): v is ParsedSummary {
  return (
    v &&
    typeof v === "object" &&
    typeof v.cause === "string" &&
    typeof v.correction === "string" &&
    (v.estimatedLaborTime === null || (typeof v.estimatedLaborTime === "number" && isFinite(v.estimatedLaborTime)))
  );
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY is not set" }, { status: 500 });
    }

    const supabase = getAdminSupabase();

    const { vehicle, workOrderLineId, messages, context } = (await req.json()) as {
      vehicle: Vehicle;
      workOrderLineId: string;
      messages: { role: "system" | "user" | "assistant"; content: string }[];
      context?: string;
    };

    if (!vehicle?.year || !vehicle?.make || !vehicle?.model || !workOrderLineId) {
      return NextResponse.json({ error: "Missing inputs" }, { status: 400 });
    }

    const vdesc = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;

    const systemPrompt = [
      `You are a master automotive diagnostic assistant summarizing a completed diagnostic conversation for a ${vdesc}.`,
      `Return ONLY a single JSON object with this exact shape:`,
      `{"cause": string, "correction": string, "estimatedLaborTime": number | null}`,
      `- "cause": one-sentence root cause.`,
      `- "correction": one- or two-sentence repair performed / recommended.`,
      `- "estimatedLaborTime": hours as a number (e.g., 1.2), or null if unknown.`,
      `No extra keys, no markdown, no prose.`,
    ].join("\n");

    const chat = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.2,
      // Ask for strict JSON
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        ...(context?.trim() ? [{ role: "user" as const, content: `Context:\n${context}` }] : []),
        ...messages.map((m) => ({
          role: m.role as "system" | "user" | "assistant",
          content: m.content,
        })),
        { role: "user", content: "Return ONLY the JSON object." },
      ],
      max_tokens: 400,
    });

    const raw = chat.choices?.[0]?.message?.content ?? "{}";

    let parsed: ParsedSummary;
    try {
      parsed = JSON.parse(raw) as ParsedSummary;
    } catch (e) {
      // Last-ditch cleanup if the model ever sneaks in fences
      const cleaned = raw.replace(/^\s*```json\s*|\s*```\s*$/g, "");
      parsed = JSON.parse(cleaned) as ParsedSummary;
    }

    if (!isParsedSummary(parsed)) {
      return NextResponse.json(
        { error: "Model returned invalid JSON shape", raw },
        { status: 502 },
      );
    }

    const { cause, correction, estimatedLaborTime } = parsed;

    const { error } = await supabase
      .from("work_order_lines")
      .update({
        cause,
        correction,
        labor_time:
          typeof estimatedLaborTime === "number" && isFinite(estimatedLaborTime)
            ? estimatedLaborTime
            : null,
      })
      .eq("id", workOrderLineId);

    if (error) {
      console.error("Supabase update error:", error);
      return NextResponse.json({ error: "DB update failed" }, { status: 500 });
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("assistant/export error:", err);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}