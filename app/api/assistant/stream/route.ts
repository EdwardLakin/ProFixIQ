// app/api/assistant/stream/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Vehicle = { year: string; make: string; model: string };
type TextPart = { type: "text"; text: string };
type ImagePart = { type: "image_url"; image_url: { url: string } };

type ClientMessage =
  | { role: "user" | "assistant" | "system"; content: string }
  | { role: "user"; content: (TextPart | ImagePart)[] };

interface Body {
  vehicle?: Vehicle;
  messages?: ClientMessage[];
  // optional helpers passed from the client hook
  prompt?: string;
  dtcCode?: string;
  image_data?: string;
  context?: string;
}

const sseHeaders: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
};

function hasVehicle(v?: Vehicle): v is Vehicle {
  return Boolean(v?.year && v?.make && v?.model);
}

function systemFor(vehicle: Vehicle): string {
  const vdesc = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
  return [
    `You are a top-level automotive diagnostic assistant working on a ${vdesc}.`,
    `Your goal is to help a technician reach a correct diagnosis fast and safely.`,
    ``,
    `Style & Output`,
    `- Be concise but complete; use **Markdown** with clear sections.`,
    `- Favor checklists and stepwise flows a tech can follow in the bay.`,
    `- When appropriate, include **Estimated Labor Time** (hrs) and call out special tools.`,
    ``,
    `Reasoning Rules`,
    `- Always ground advice in measurements, symptoms, and test results the user provides.`,
    `- If critical info is missing (scan data, DTCs, fuel trims, volt/ohm/psi, scope captures), ask for it explicitly.`,
    `- Where possible, reference typical **spec ranges** (e.g., voltage drop < 0.2V, MAP kPa ranges, fuel pressure, resistance).`,
    `- Prefer **decision trees**: explain why a measurement points to path A vs path B.`,
    `- If multiple faults are plausible, list top 2–3 hypotheses with the **discriminator test** for each.`,
    `- If an image is included, identify the component(s), visible failure modes, and what to inspect/measure next.`,
    `- For DTCs, give a brief decode, common root causes, and an ordered test plan (non-invasive → invasive).`,
    `- When readings conflict with expected specs, propose **sanity checks** (meter leads, grounds, reference voltage, tool settings).`,
    `- Consider TSBs, software updates, known pattern failures when relevant (mention to "check TSBs").`,
    `- Never invent numbers or facts. If unsure, say what to verify next.`,
    ``,
    `Structure your replies with headings like:`,
    `**Complaint / Context** — short recap`,
    `**Observations / Data** — echo the key numbers the user gave`,
    `**Likely Causes** — ranked list with a one-liner why`,
    `**Next Tests** — bullet list with exact meter hookups, engine state (KOEO/KOER), and expected specs`,
    `**Recommended Fix** — concise corrective action(s)`,
    `**Estimated Labor Time** — hours with a sensible range`,
  ].join("\n");
}

function toOpenAIMessage(m: ClientMessage): ChatCompletionMessageParam {
  if (Array.isArray(m.content)) {
    return { role: "user", content: m.content };
  }
  return { role: m.role, content: m.content };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    if (!hasVehicle(body.vehicle)) {
      return new NextResponse(JSON.stringify({ error: "Missing vehicle info." }), {
        status: 400,
        headers: sseHeaders,
      });
    }

    // Build final message list (system + client messages + optional helpers)
    const baseMessages = (body.messages ?? []).map(toOpenAIMessage);

    const helperMessages: ChatCompletionMessageParam[] = [];
    if (body.prompt) helperMessages.push({ role: "user", content: body.prompt });
    if (body.dtcCode) helperMessages.push({ role: "user", content: `DTC: ${body.dtcCode}` });
    if (body.image_data) {
      helperMessages.push({
        role: "user",
        content: [{ type: "image_url", image_url: { url: body.image_data } }],
      });
    }
    if (body.context?.trim()) {
      helperMessages.push({ role: "user", content: `Context:\n${body.context}` });
    }

    const withSystem: ChatCompletionMessageParam[] = [
      { role: "system", content: systemFor(body.vehicle) },
      ...baseMessages,
      ...helperMessages,
    ];

    // Create a streaming completion and pipe its ReadableStream as-is to the client
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.6,
      messages: withSystem,
      stream: true,
    });

    const rs: ReadableStream<Uint8Array> = completion.toReadableStream();
    return new NextResponse(rs, { headers: sseHeaders });
  } catch (err) {
    // Keep error typed
    const msg =
      err instanceof Error ? err.message : typeof err === "string" ? err : "Assistant failed.";
    console.error("assistant/stream error:", msg);
    return new NextResponse(JSON.stringify({ error: msg }), {
      status: 500,
      headers: sseHeaders,
    });
  }
}