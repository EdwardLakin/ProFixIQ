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

const enc = (s: string) => new TextEncoder().encode(s);
const lineSafe = (s: unknown) => String(s).replace(/[\r\n]+/g, " ");
const sanitize = (s: string) =>
  s.replace(/\b(event:\s*done|data:\s*\[DONE\])\b/gi, "").trim();

const hasVehicle = (v?: Vehicle): v is Vehicle =>
  Boolean(v?.year && v?.make && v?.model);

function systemFor(v: Vehicle, context?: string): string {
  const vdesc = `${v.year} ${v.make} ${v.model}`;
  const ctx = context?.trim() ? `\nContext:\n${context.trim()}` : "";
  return [
    `You are a master automotive technician assistant for a ${vdesc}.`,
    `Formatting rules (VERY IMPORTANT):`,
    `- Use **Markdown** with headings and bullet/numbered lists (real line breaks).`,
    `- For procedures, output sections in this order:`,
    `  ### Summary`,
    `  - 1–2 concise bullets`,
    `  `,
    `  ### Procedure`,
    `  1. Step`,
    `  2. Step`,
    `  `,
    `  ### Notes / Cautions`,
    `  - Bullets for cautions/specs/checks`,
    `- Do **NOT** include transport markers like "event: done" or "data: [DONE]".`,
    ``,
    `Follow-up behavior (CRITICAL):`,
    `- Focus only on the latest question.`,
    `- If it’s narrow (torque, tool size, single step), answer just that with a short heading and bullets.`,
    `- Don’t repeat the entire procedure unless asked.`,
    `- If exact specs may vary, label ranges as **Typical** and note to verify in OE service info (VIN/engine/trim).`,
    ``,
    `Safety & accuracy: prefer decision points; never invent exact figures.`,
    ctx,
  ].join("\n");
}

function toOpenAIMessage(m: ClientMessage): ChatCompletionMessageParam {
  return Array.isArray(m.content) ? { role: "user", content: m.content } : m;
}

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
      temperature: 0.5,
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