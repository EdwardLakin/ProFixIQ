// app/api/assistant/export/route.ts
export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Vehicle = { year: string; make: string; model: string };
type ChatMessage = { role: "user" | "assistant"; content: string };

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function normalizeMarkdown(s: string): string {
  let out = (s ?? "").trim();
  out = out.replace(/\b(event:\s*done|data:\s*\[DONE\])\b/gi, "");
  out = out.replace(/(#{2,6})([^\s#])/g, (_m, hashes, rest) => `${hashes} ${rest}`);
  out = out.replace(/([.:;])([A-Za-z0-9])/g, "$1 $2");
  out = out.replace(/(\d+)\.\s*/g, "$1. ");
  out = out.replace(/(-|\*)\s*/g, "$1 ");
  out = out.replace(/\n{3,}/g, "\n\n");
  return out.trim();
}

export async function POST(req: Request) {
  try {
    const { vehicle, messages, workOrderLineId } = (await req.json()) as {
      vehicle?: Vehicle;
      messages?: ChatMessage[];
      workOrderLineId?: string;
    };

    if (!vehicle?.year || !vehicle?.make || !vehicle?.model) {
      return NextResponse.json({ error: "Missing vehicle info." }, { status: 400 });
    }
    if (!workOrderLineId) {
      return NextResponse.json({ error: "Missing work order line id." }, { status: 400 });
    }

    const prompt = [
      `Vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      `You are preparing a concise work-order entry for a shop management system.`,
      `From the conversation below, produce:`,
      `- Cause: one or two sentences`,
      `- Correction: short bullet list (1–5 bullets)`,
      `- EstimatedLaborTime: a decimal number in hours when appropriate, else null`,
      ``,
      `Conversation (latest last):`,
      ...(messages ?? []).map((m) => `${m.role.toUpperCase()}: ${m.content}`),
      ``,
      `Return JSON with these exact keys: { "cause": string, "correction": string, "estimatedLaborTime": number | null }`,
    ].join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.3,
      stream: false,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as {
      cause?: string;
      correction?: string;
      estimatedLaborTime?: number | null;
    };

    // Optional: persist to DB (example upsert)
    const supabase = createClient<Database>(
      getEnv("NEXT_PUBLIC_SUPABASE_URL"),
      getEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );

    await supabase
      .from("work_order_line_summaries")
      .upsert({
        work_order_line_id: workOrderLineId,
        cause: normalizeMarkdown(parsed.cause ?? ""),
        correction: normalizeMarkdown(parsed.correction ?? ""),
        estimated_labor_time: parsed.estimatedLaborTime ?? null,
        updated_at: new Date().toISOString(),
      });

    return NextResponse.json({
      cause: normalizeMarkdown(parsed.cause ?? ""),
      correction: normalizeMarkdown(parsed.correction ?? ""),
      estimatedLaborTime: parsed.estimatedLaborTime ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}