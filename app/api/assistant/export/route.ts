// app/api/assistant/export/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Vehicle = { year: string; make: string; model: string };

// Lazily create admin client at REQUEST time (not import time)
function getAdminSupabase() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Supabase URL or Service Role key is missing");
  }
  return createClient<Database>(url, serviceKey);
}

export async function POST(req: Request) {
  try {
    const supabase = getAdminSupabase();

    const {
      vehicle,
      workOrderLineId,
      messages,
      context,
    } = (await req.json()) as {
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
      `You will produce a shop-ready entry that a service advisor can paste into the work order.`,
      ``,
      `STYLE & TONE`,
      `- Write like an experienced technician. Be concise, specific, and professional.`,
      `- Prefer concrete observations over theory. If a measurement exists in the chat, include it (voltage, ohms, pressure, trims, codes, freeze-frame).`,
      `- Avoid speculation, marketing language, or long background explanations.`,
      ``,
      `CONTENT RULES`,
      `- Read the full conversation and pull only the facts, test steps, and results.`,
      `- If multiple tests were performed, reflect the logical flow (what was checked and what that implied).`,
      `- If a part failed, state why (e.g., "fuel pressure 34 psi (spec 55–62), pump power and ground verified").`,
      `- If the final fix is conditional (e.g., intermittent), say so.`,
      ``,
      `OUTPUT FORMAT`,
      `Return ONLY a JSON object with this exact shape (no prose, no code fences):`,
      `{ "cause": string, "correction": string, "estimatedLaborTime": number | null }`,
      `- "cause": 1–2 sentences naming the root cause with key evidence/measurements.`,
      `- "correction": clear, past-tense work performed and any calibration/programming/learning steps.`,
      `- "estimatedLaborTime": realistic decimal hours (e.g., 1.3). If genuinely unknown, use null.`,
      ``,
      `LABOR ESTIMATING GUIDANCE (not to be output verbatim)`,
      `- Simple sensor/connector R&R with access underhood: 0.4–0.9 h.`,
      `- Fuel pump or in-tank module: 1.2–3.0 h (vehicle dependent).`,
      `- Intake/throttle/EGR cleaning & relearn: 0.6–1.2 h.`,
      `- Charging/starting diagnosis & repair: 0.7–1.5 h.`,
      `Pick a number that matches the work implied by the chat; do not exceed what the described repair reasonably takes.`,
      ``,
      `VALIDATION`,
      `- Do not invent readings. Only include measurements that appear in the conversation.`,
      `- If the conversation never reached a confirmed fix, set "estimatedLaborTime" to null and make "correction" a recommended next action.`,
    ].join("\n");

    const chat = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        ...(context?.trim()
          ? [{ role: "user" as const, content: `Context:\n${context}` }]
          : []),
        ...(messages.map((m) => ({
          role: m.role as "system" | "user" | "assistant",
          content: m.content,
        })) as { role: "system" | "user" | "assistant"; content: string }[]),
        { role: "user", content: "Return ONLY the JSON object, no prose." },
      ],
    });

    const raw = chat.choices?.[0]?.message?.content?.trim() || "{}";

    let parsed: { cause: string; correction: string; estimatedLaborTime: number | null };
    try {
      parsed = JSON.parse(raw);
    } catch {
      const cleaned = raw.replace(/^```json|```$/g, "");
      parsed = JSON.parse(cleaned);
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

    return NextResponse.json({ cause, correction, estimatedLaborTime });
  } catch (err) {
    console.error("assistant/export error:", err);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}