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

function isParsedSummary(v: unknown): v is ParsedSummary {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  const ok =
    typeof o.cause === "string" &&
    typeof o.correction === "string" &&
    (o.estimatedLaborTime === null ||
      (typeof o.estimatedLaborTime === "number" && Number.isFinite(o.estimatedLaborTime)));
  return ok;
}

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !serviceKey) throw new Error("Supabase URL or Service Role key is missing");
  return createClient<Database>(url, serviceKey);
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY is not set" }, { status: 500 });
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
      `Return ONLY JSON with exactly: {"cause": string, "correction": string, "estimatedLaborTime": number | null}`,
      `Keep it concise and grounded in the provided chat.`,
    ].join("\n");

    const chat = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        ...(context?.trim() ? [{ role: "user" as const, content: `Context:\n${context}` }] : []),
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: "Return only the JSON object." },
      ],
      max_tokens: 400,
    });

    const raw = chat.choices?.[0]?.message?.content ?? "{}";

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const cleaned = raw.replace(/^\s*```json\s*|\s*```\s*$/g, "");
      parsed = JSON.parse(cleaned);
    }
    if (!isParsedSummary(parsed)) {
      return NextResponse.json({ error: "Model returned invalid JSON", raw }, { status: 502 });
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