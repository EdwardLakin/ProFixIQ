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

type Body = {
  vehicle?: Vehicle;
  messages?: ClientMessage[];
};

const sseHeaders = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
};

function hasVehicle(v?: Vehicle): v is Vehicle {
  return !!v?.year && !!v?.make && !!v?.model;
}

/** Diagnostic-forward system prompt */
function systemFor(vehicle: Vehicle) {
  const vdesc = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
  return [
    `You are a top-level automotive diagnostic assistant working on a ${vdesc}.`,
    `Be concise, practical, and measurement-driven. Use **Markdown** sections.`,
    `Ask for missing critical data (scan data, trims, volts/ohms/psi, scope captures).`,
    `Prefer decision trees and exact meter hookups. Never invent numbers.`,
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
    if (!process.env.OPENAI_API_KEY) {
      return new NextResponse(`data: ${JSON.stringify({ type: "error", error: "OPENAI_API_KEY is not set" })}\n\n`, {
        status: 500,
        headers: sseHeaders,
      });
    }

    const body = (await req.json()) as Body;
    if (!hasVehicle(body.vehicle)) {
      return new NextResponse(`data: ${JSON.stringify({ type: "error", error: "Missing vehicle info." })}\n\n`, {
        status: 400,
        headers: sseHeaders,
      });
    }

    const messages = (body.messages ?? []).map(toOpenAIMessage);
    const withSystem: ChatCompletionMessageParam[] = [
      { role: "system", content: systemFor(body.vehicle) },
      ...messages,
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.6,
      messages: withSystem,
      stream: true,
    });

    // The OpenAI SDK exposes a web ReadableStream for SSE.
    const rs: ReadableStream = completion.toReadableStream();
    return new NextResponse(rs, { headers: sseHeaders });
  } catch (err: any) {
    console.error("assistant/stream error:", err);
    const msg = typeof err?.message === "string" ? err.message : "Assistant failed.";
    return new NextResponse(`data: ${JSON.stringify({ type: "error", error: msg })}\n\n`, {
      status: 500,
      headers: sseHeaders,
    });
  }
}