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
  messages?: ClientMessage[]; // client already appends the newest user turn
  context?: string;            // optional notes; we don’t echo as a separate turn
}

const sseHeaders = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
};

const hasVehicle = (v?: Vehicle): v is Vehicle =>
  Boolean(v?.year && v?.make && v?.model);

function systemFor(v: Vehicle, context?: string): string {
  const vdesc = `${v.year} ${v.make} ${v.model}`;
  const ctx = context?.trim() ? `\nContext notes:\n${context.trim()}\n` : "";
  return [
    `You are a master automotive technician assistant working on a ${vdesc}.`,
    `Reply concisely in **Markdown** with clear sections and bullet steps.`,
    `Only ask for missing critical info if truly required; otherwise provide a direct, safe, step-by-step plan.`,
    `Prefer checklists and exact measurements/specs when relevant.`,
    `Do not greet or restate the question; jump straight into the answer.`,
    ctx,
    `Format:`,
    `**Summary** – 1–2 sentences`,
    `**Specs** – bullets (only if relevant)`,
    `**Procedure** – numbered, shop-safe steps`,
    `**Notes / Cautions** – brief`,
  ].join("\n");
}

function toOpenAIMessage(m: ClientMessage): ChatCompletionMessageParam {
  return Array.isArray(m.content) ? { role: "user", content: m.content } : m;
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return new NextResponse("Missing OPENAI_API_KEY", { status: 500, headers: sseHeaders });
    }

    const body: Body = await req.json();

    if (!hasVehicle(body.vehicle)) {
      return new NextResponse("Missing vehicle info.", { status: 400, headers: sseHeaders });
    }

    const messages = (body.messages ?? []).map(toOpenAIMessage);

    // Important: we only prepend the system message; we do not add any extra user turns here
    const withSystem: ChatCompletionMessageParam[] = [
      { role: "system", content: systemFor(body.vehicle, body.context) },
      ...messages,
    ];

    // Stream OpenAI native SSE (data: {json}\n\n ... data: [DONE]\n\n)
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.5,
      stream: true,
      messages: withSystem,
    });

    const rs = completion.toReadableStream();
    return new NextResponse(rs, { headers: sseHeaders });
  } catch (err) {
    console.error("assistant/stream error:", err);
    // Return a small SSE payload so the client shows an error instead of a blank bar
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices:[{delta:{content:"**Error:** Assistant failed to reply."}}] })}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    return new NextResponse(stream, { headers: sseHeaders, status: 200 });
  }
}