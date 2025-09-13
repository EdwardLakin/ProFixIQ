import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---- Types ----
type Vehicle = { year: string; make: string; model: string };

type ParsedSummary = {
  cause: string;
  correction: string;
  estimatedLaborTime: number | null;
};

// ---- Supabase (admin) ----
function getAdminSupabase() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const service =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !service) {
    throw new Error("Supabase URL or Service Role key is missing");
  }
  return createClient<Database>(url, service);
}

// type guard for returned JSON
function isParsedSummary(v: unknown): v is ParsedSummary {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const causeOk = typeof o.cause === "string";
  const correctionOk = typeof o.correction === "string";
  const elt = o.estimatedLaborTime;
  const eltOk = elt === null || (typeof elt === "number" && Number.isFinite(elt));
  return causeOk && correctionOk && eltOk;
}

// ---- Route ----
export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not set" },
        { status: 500 },
      );
    }

    const supabase = getAdminSupabase();

    const payload = (await req.json()) as {
      vehicle: Vehicle;
      workOrderLineId: string;
      messages: { role: "system" | "user" | "assistant"; content: string }[];
      context?: string;
    };

    const { vehicle, workOrderLineId, messages, context } = payload;

    if (!vehicle?.year || !vehicle?.make || !vehicle?.model || !workOrderLineId) {
      return NextResponse.json({ error: "Missing inputs" }, { status: 400 });
    }

    const vdesc = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;

    const systemPrompt = [
      `You are summarizing a completed diagnostic conversation for a ${vdesc}.`,
      `Return **ONLY** a single JSON object with exactly:`,
      `{"cause": string, "correction": string, "estimatedLaborTime": number | null}`,
      `- "cause": one-sentence root cause.`,
      `- "correction": one- or two-sentence repair performed / recommended.`,
      `- "estimatedLaborTime": hours as a number (e.g., 1.2), or null if unknown.`,
      `No extra keys. No markdown. No prose.`,
    ].join("\n");

    const chat = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        ...(context?.trim()
          ? [{ role: "user" as const, content: `Context:\n${context}` }]
          : []),
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: "Return ONLY the JSON object." },
      ],
      max_tokens: 400,
    });

    const raw = chat.choices?.[0]?.message?.content ?? "{}";

    // try parsing; also handle fenced JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const cleaned = raw.replace(/^\s*```json\s*|\s*```\s*$/g, "");
      parsed = JSON.parse(cleaned);
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
          typeof estimatedLaborTime === "number" && Number.isFinite(estimatedLaborTime)
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