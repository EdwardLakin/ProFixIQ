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
    `- Ground advice in measurements, symptoms, and test results the user provides.`,
    `- If critical info is missing (scan data, DTCs, fuel trims, volt/ohm/psi, scope captures), ask for it explicitly.`,
    `- Where possible, reference typical **spec ranges** and decision trees.`,
    `- Consider TSBs, software updates, and pattern failures; never invent numbers.`,
    ``,
    `Structure replies with headings like:`,
    `**Complaint / Context**`,
    `**Observations / Data**`,
    `**Likely Causes**`,
    `**Next Tests**`,
    `**Recommended Fix**`,
    `**Estimated Labor Time**`,
  ].join("\n");
}

function toOpenAIMessage(m: ClientMessage): ChatCompletionMessageParam {
  return Array.isArray(m.content)
    ? { role: "user", content: m.content }
    : { role: m.role, content: m.content };
}

export async function POST(req: Request) {
  try {
    const body: Body = await req.json();

    if (!hasVehicle(body.vehicle)) {
      return new NextResponse(JSON.stringify({ error: "Missing vehicle info." }), {
        status: 400,
        headers: sseHeaders,
      });
    }

    const userMessages = (body.messages ?? []).map(toOpenAIMessage);

    // ⛔️ Do not let the model answer only to a system prompt.
    if (userMessages.length === 0) {
      return new NextResponse(JSON.stringify({ error: "Please ask a question to start." }), {
        status: 400,
        headers: sseHeaders,
      });
    }

    const withSystem: ChatCompletionMessageParam[] = [
      { role: "system", content: systemFor(body.vehicle) },
      ...userMessages,
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.6,
      messages: withSystem,
      stream: true,
    });

    // Pipe OpenAI's ReadableStream straight through as SSE
    const rs: ReadableStream = completion.toReadableStream();
    return new NextResponse(rs, { headers: sseHeaders });
  } catch (err: unknown) {
    console.error("assistant/stream error:", err);

    const msg =
      err instanceof Error
        ? err.message
        : typeof err === "string"
        ? err
        : "Assistant failed.";

    return new NextResponse(JSON.stringify({ error: msg }), {
      status: 500,
      headers: sseHeaders,
    });
  }
}