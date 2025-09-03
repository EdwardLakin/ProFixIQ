// app/api/assistant/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { createClient } from "@supabase/supabase-js";
// If you keep a DB type, import it; otherwise omit:
// import type { Database } from "@shared/types/types/supabase";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** Minimal vehicle context */
type Vehicle = { year: string; make: string; model: string };

/** Chat turn you store on the client */
type TextPart = { type: "text"; text: string };
type ImagePart = { type: "image_url"; image_url: { url: string } };
type ClientMessage =
  | { role: "user" | "assistant" | "system"; content: string }
  | { role: "user"; content: (TextPart | ImagePart)[] }; // user can send multimodal

type Body = {
  vehicle?: Vehicle;
  /** Full running chat transcript you keep on the client */
  messages?: ClientMessage[];
  /** Optional “action” to summarize & export */
  action?:
    | "chat" // default
    | "summarize-and-export";
  /** Target WO line when exporting summary */
  workOrderLineId?: string;
};

function hasVehicle(v?: Vehicle): v is Vehicle {
  return !!v?.year && !!v?.make && !!v?.model;
}

/** System prompt—no modes; assistant figures it out from context/media */
function systemFor(vehicle: Vehicle) {
  const vdesc = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
  return [
    `You are a top-level automotive diagnostic assistant working on a ${vdesc}.`,
    `You can see conversation context and sometimes images.`,
    `Be concise, structured, and hands-on.`,
    `Always reply in Markdown with clear sections like **Complaint**, **Observations / Data**, **Likely Causes**, **Recommended Fix**, **Estimated Labor Time**.`,
    `If the user provides OBD-II codes, waveforms, or test readings, incorporate them into the reasoning.`,
    `If a calculation or check is needed, lay out steps for the tech.`,
    `Never hallucinate data; ask for missing readings (voltage/ohms/psi, etc.) when needed.`,
  ].join(" ");
}

/** Convert client message (with possible image parts) into Chat API message */
function toOpenAIMessage(m: ClientMessage): ChatCompletionMessageParam {
  if (Array.isArray(m.content)) {
    // multimodal user message
    return { role: "user", content: m.content };
  }
  // plain text message
  return { role: m.role, content: m.content };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    if (!hasVehicle(body.vehicle)) {
      return NextResponse.json(
        { error: "Missing vehicle info (year/make/model)." },
        { status: 400 }
      );
    }

    const messages = (body.messages ?? []).map(toOpenAIMessage);
    const withSystem: ChatCompletionMessageParam[] = [
      { role: "system", content: systemFor(body.vehicle) },
      ...messages,
    ];

    // ---------- ACTION: Summarize + Export ----------
    if (body.action === "summarize-and-export") {
      if (!body.workOrderLineId) {
        return NextResponse.json(
          { error: "workOrderLineId is required for summarize-and-export." },
          { status: 400 }
        );
      }

      // Ask the model for a structured JSON summary we can persist
      const summarizePrompt =
        "Summarize the conversation into JSON with fields: " +
        `{"cause": string, "correction": string, "steps": string[], "estimatedLaborTimeHours": number}. ` +
        "Keep text succinct but specific. Use the technician's measurements when present.";

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        temperature: 0.4,
        messages: [
          ...withSystem,
          { role: "user", content: summarizePrompt },
        ],
      });

      const raw = completion.choices?.[0]?.message?.content ?? "";
      let parsed: {
        cause?: string;
        correction?: string;
        steps?: string[];
        estimatedLaborTimeHours?: number;
      } = {};
      try {
        parsed = JSON.parse(raw);
      } catch {
        // If model produced markdown fenced JSON, try a loose parse:
        const m = raw.match(/```json([\s\S]*?)```/i) || raw.match(/({[\s\S]*})/);
        if (m) parsed = JSON.parse(m[1]);
      }

      // Update WO line in Supabase
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      ); // service role needed to update server-side

      await supabase
        .from("work_order_lines")
        .update({
          cause: parsed.cause ?? null,
          correction: parsed.correction ?? null,
          labor_time:
            typeof parsed.estimatedLaborTimeHours === "number"
              ? parsed.estimatedLaborTimeHours
              : null,
          // Optionally: set status or punch out:
          // status: "completed",
          // punched_out_at: new Date().toISOString(),
        })
        .eq("id", body.workOrderLineId);

      return NextResponse.json({
        ok: true,
        saved: {
          workOrderLineId: body.workOrderLineId,
          ...parsed,
        },
      });
    }

    // ---------- ACTION: Chat (default) ----------
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.6,
      messages: withSystem,
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ??
      "No response.";
    return NextResponse.json({ reply });
  } catch (err) {
    console.error("assistant error:", err);
    return NextResponse.json({ error: "Assistant failed." }, { status: 500 });
  }
}