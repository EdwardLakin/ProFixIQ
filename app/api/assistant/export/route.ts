// app/api/assistant/export/route.ts
export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Vehicle = {
  year?: string | null;
  make?: string | null;
  model?: string | null;
};

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
      return NextResponse.json(
        { error: "Missing vehicle info." },
        { status: 400 },
      );
    }
    if (!workOrderLineId) {
      return NextResponse.json(
        { error: "Missing work order line id." },
        { status: 400 },
      );
    }

    const prompt = [
      `Vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      `You are preparing a concise work-order entry for a shop management system.`,
      `From the conversation below, produce:`,
      `- Cause: one or two sentences (this is the diagnosis / story of what you found).`,
      `- Correction: short bullet list (1–5 bullets).`,
      `- EstimatedLaborTime: a decimal number in hours when appropriate, else null.`,
      ``,
      `Conversation (latest last):`,
      ...(messages ?? []).map((m) => `${m.role.toUpperCase()}: ${m.content}`),
      ``,
      `Return JSON with these exact keys: { "cause": string, "correction": string, "estimatedLaborTime": number | null }`,
    ].join("\n");

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL?.trim() || "gpt-4o",
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

    const cause = normalizeMarkdown(parsed.cause ?? "");
    const correction = normalizeMarkdown(parsed.correction ?? "");
    const estimatedLaborTime =
      typeof parsed.estimatedLaborTime === "number"
        ? parsed.estimatedLaborTime
        : null;

    // We only *require* cause now; correction can be empty
    if (!cause) {
      return NextResponse.json(
        { error: "Model did not return a valid cause." },
        { status: 500 },
      );
    }

    // 🔐 Supabase service client
    const supabase = createClient<Database>(
      getEnv("NEXT_PUBLIC_SUPABASE_URL"),
      getEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );

    // Optional: ensure line exists (nicer error)
    const { data: line, error: lineErr } = await supabase
      .from("work_order_lines")
      .select("id")
      .eq("id", workOrderLineId)
      .maybeSingle();

    if (lineErr) {
      return NextResponse.json(
        { error: "Failed to load work order line." },
        { status: 500 },
      );
    }
    if (!line) {
      return NextResponse.json(
        { error: "Work order line not found." },
        { status: 404 },
      );
    }

    // ✅ Only write cause + labor_time.
    //    We DO NOT touch correction here, so tech keeps full control of that story.
    const updates: Database["public"]["Tables"]["work_order_lines"]["Update"] =
      {
        cause,
        labor_time: estimatedLaborTime,
      };

    const { data: updated, error: updateErr } = await supabase
      .from("work_order_lines")
      .update(updates)
      .eq("id", workOrderLineId)
      .select("cause, correction, labor_time")
      .maybeSingle();

    if (updateErr) {
      return NextResponse.json(
        { error: "Failed to save story to work order line." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      cause: updated?.cause ?? cause,
      // Return whatever correction is currently on the line (or the AI suggestion),
      // but we never overwrite it in this route.
      correction: updated?.correction ?? correction,
      estimatedLaborTime:
        typeof updated?.labor_time === "number"
          ? (updated.labor_time as number)
          : estimatedLaborTime,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}