// app/api/assistant/stream/route.ts
export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Vehicle = { year: string; make: string; model: string };

// Multi-modal parts we may receive from the client (text + image)
type TextPart = { type: "text"; text: string };
type ImagePart = { type: "image_url"; image_url: { url: string } };

type ClientMessage =
  | { role: "user" | "assistant" | "system"; content: string }
  | { role: "user"; content: (TextPart | ImagePart)[] };

interface Body {
  vehicle?: Vehicle;
  messages?: ClientMessage[];
  context?: string;
  /** optional data URL (base64 image) we attach as a trailing user turn */
  image_data?: string;
}

const sseHeaders: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
  // (chunked is implicit on edge; keeping responses streamy)
};

// Guard: basic presence of Y/M/M
const hasVehicle = (v?: Vehicle): v is Vehicle =>
  Boolean(v?.year && v?.make && v?.model);

// Strip any accidental transport tokens the model might echo
const sanitize = (s: string) =>
  String(s).replace(/\b(event:\s*done|data:\s*\[DONE\])\b/gi, "");

// Safer single-line log
const lineSafe = (s: unknown) => String(s).replace(/[\r\n]+/g, " ");

// Strong output contract: headings + lists, focused follow-ups
function systemFor(v: Vehicle, context?: string): string {
  const vdesc = `${v.year} ${v.make} ${v.model}`;
  const ctx = context?.trim() ? `\nContext:\n${context.trim()}` : "";
  return [
    `You are a master automotive technician assistant for a ${vdesc}.`,
    `Always answer in clean **Markdown**.`,
    `Formatting contract (MANDATORY):`,
    `- Start with proper headings and line breaks.`,
    `- Use this structure where applicable:`,
    `  ### Summary`,
    `  - 1–3 concise bullets`,
    `  `,
    `  ### Procedure`,
    `  1. Step`,
    `  2. Step`,
    `  3. Step`,
    `  `,
    `  ### Notes / Cautions`,
    `  - Bulleted cautions, specs, tips`,
    `Behavior for follow-ups (CRITICAL):`,
    `- Focus ONLY on the latest user request. Do not repeat the full procedure if the question is narrow (e.g., torque spec, a single disassembly).`,
    `- Give realistic ranges as “Typical” only if you’re not certain; otherwise instruct where to confirm in OE service info (VIN/trim).`,
    `- Never include transport markers like "event: done" or "[DONE]".`,
    ctx,
  ].join("\n");
}

// Normalize client message into OpenAI shape
function toOpenAIMessage(m: ClientMessage): ChatCompletionMessageParam {
  return Array.isArray(m.content) ? { role: "user", content: m.content } : m;
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return new NextResponse(
        `event: error\ndata: Missing OPENAI_API_KEY\n\nevent: done\ndata: [DONE]\n\n`,
        { headers: sseHeaders, status: 500 },
      );
    }

    const body: Body = await req.json();
    if (!hasVehicle(body.vehicle)) {
      return new NextResponse(
        `event: error\ndata: Missing vehicle info (year, make, model)\n\nevent: done\ndata: [DONE]\n\n`,
        { headers: sseHeaders, status: 400 },
      );
    }

    // Build the conversation with our system preface
    const base: ChatCompletionMessageParam[] = [
      { role: "system", content: systemFor(body.vehicle, body.context) },
      ...(body.messages ?? []).map(toOpenAIMessage),
    ];

    // If we received an ad-hoc image data URL for the *latest* user turn,
    // add a trailing user message that contains the image for vision models.
    if (body.image_data && /^data:image\/\w+;base64,/.test(body.image_data)) {
      base.push({
        role: "user",
        content: [{ type: "image_url", image_url: { url: body.image_data } }],
      } as ChatCompletionMessageParam);
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.5,
      stream: true,
      messages: base,
    });

    const enc = (s: string) => new TextEncoder().encode(s);

    // Stream “plain text SSE” lines like:  data: <text>\n\n
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const part of completion) {
            const delta = part.choices?.[0]?.delta?.content ?? "";
            if (delta) controller.enqueue(enc(`data: ${sanitize(delta)}\n\n`));
          }
          controller.enqueue(enc(`event: done\ndata: [DONE]\n\n`));
          controller.close();
        } catch (err) {
          controller.enqueue(
            enc(`event: error\ndata: ${lineSafe((err as Error).message)}\n\n`),
          );
          controller.enqueue(enc(`event: done\ndata: [DONE]\n\n`));
          controller.close();
        }
      },
    });

    return new NextResponse(stream, { headers: sseHeaders });
  } catch (err) {
    return new NextResponse(
      `event: error\ndata: ${lineSafe((err as Error).message)}\n\nevent: done\ndata: [DONE]\n\n`,
      { headers: sseHeaders, status: 500 },
    );
  }
}