export const runtime = "edge";
export const dynamic = "force-dynamic";

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
  context?: string;
}

const sseHeaders: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "Transfer-Encoding": "chunked",
  "X-Accel-Buffering": "no",
};

const hasVehicle = (v?: Vehicle): v is Vehicle =>
  Boolean(v?.year && v?.make && v?.model);

// simple sanitize for any accidental transport tokens in model text
const sanitize = (s: string) =>
  s.replace(/\b(event:\s*done|data:\s*\[DONE\])\b/gi, "");

function systemFor(v: Vehicle, context?: string): string {
  const vdesc = `${v.year} ${v.make} ${v.model}`;
  const ctx = context?.trim() ? `\nContext:\n${context.trim()}` : "";

  return [
    `You are a master automotive technician assistant for a ${vdesc}.`,
    `Always answer in clean **Markdown** with proper newlines and spacing.`,
    `When the user asks for procedures, structure exactly as:`,
    `### Summary`,
    `- 1–2 bullets, concise`,
    ``,
    `### Procedure`,
    `1. Step`,
    `2. Step`,
    `3. Step`,
    ``,
    `### Notes / Cautions`,
    `- Bulleted cautions/specs/checks`,
    ``,
    `If the user asks for torque/spec values, include a compact Markdown table`,
    `with headers **Component** | **Torque Spec** (or unit/spec column that fits).`,
    ``,
    `Follow-up behavior: answer ONLY the latest question without reprinting the full prior procedure unless it was explicitly requested.`,
    `Do **not** include transport markers like "event: done" or "data: [DONE]".`,
    ctx,
  ].join("\n");
}

function toOpenAIMessage(m: ClientMessage): ChatCompletionMessageParam {
  return Array.isArray(m.content) ? { role: "user", content: m.content } : m;
}

const enc = (s: string) => new TextEncoder().encode(s);
const lineSafe = (s: unknown) => String(s).replace(/[\r\n]+/g, " ");

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return new NextResponse(
        `event: error\ndata: Server missing OPENAI_API_KEY\n\nevent: done\ndata: [DONE]\n\n`,
        { headers: sseHeaders, status: 500 },
      );
    }

    const body = (await req.json()) as Body;

    if (!hasVehicle(body.vehicle)) {
      return new NextResponse(
        `event: error\ndata: Missing vehicle info (year, make, model)\n\nevent: done\ndata: [DONE]\n\n`,
        { headers: sseHeaders, status: 400 },
      );
    }

    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemFor(body.vehicle, body.context) },
      ...(body.messages ?? []).map(toOpenAIMessage),
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.4,
      stream: true,
      messages,
    });

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
          controller.enqueue(enc(`event: error\ndata: ${lineSafe((err as Error).message)}\n\n`));
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