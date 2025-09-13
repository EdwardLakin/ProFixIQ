// app/api/assistant/stream/route.ts
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
  image_data?: string | null; // base64 data URL from client (optional)
}

const sseHeaders: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

const hasVehicle = (v?: Vehicle): v is Vehicle =>
  Boolean(v?.year && v?.make && v?.model);

// scrub accidental transport tokens
const sanitize = (s: string) =>
  s.replace(/\b(event:\s*done|data:\s*\[DONE\])\b/gi, "");

function systemFor(v: Vehicle, context?: string): string {
  const vdesc = `${v.year} ${v.make} ${v.model}`;
  const ctx = context?.trim() ? `\nContext:\n${context.trim()}` : "";
  return [
    `You are a master automotive technician assistant for a ${vdesc}.`,
    `Formatting rules (IMPORTANT):`,
    `- Use **Markdown** with clear bullets and numbered steps.`,
    `- Sections (when procedure is requested):`,
    `  ### Summary`,
    `  - two bullets max`,
    `  ### Procedure`,
    `  1. step`,
    `  2. step`,
    `  ### Notes / Cautions`,
    `  - bullets`,
    `- For specs/torque, use a **table** where helpful:`,
    `  | Item | Spec/Range | Notes |`,
    `  |---|---|---|`,
    `Follow-ups (CRITICAL):`,
    `- Answer only the new question; *do not* repeat prior sections unless asked.`,
    `- If user asks “how to disassemble”, don’t re-summarize diagnosis; give the disassembly steps directly.`,
    `Don’t include trailing markers like "done" or transport metadata.`,
    ctx,
  ].join("\n");
}

function toOpenAIMessage(m: ClientMessage): ChatCompletionMessageParam {
  return Array.isArray(m.content) ? { role: "user", content: m.content } : m;
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return new NextResponse(`event: error\ndata: Missing OPENAI_API_KEY\n\n`, {
        headers: sseHeaders,
        status: 500,
      });
    }

    const body: Body = await req.json();

    if (!hasVehicle(body.vehicle)) {
      return new NextResponse(`event: error\ndata: Missing vehicle (year/make/model)\n\n`, {
        headers: sseHeaders,
        status: 400,
      });
    }

    // Build message list with a clear system prompt
    const base: ChatCompletionMessageParam[] = [
      { role: "system", content: systemFor(body.vehicle, body.context) },
      ...(body.messages ?? []).map(toOpenAIMessage),
    ];

    // If an image was provided for this turn, attach a multimodal "user" message
    if (body.image_data) {
      base.push({
        role: "user",
        content: [
          { type: "text", text: "Photo for reference (consider this in your answer)." },
          { type: "image_url", image_url: { url: body.image_data } },
        ],
      });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.5,
      messages: base,
      stream: true,
    });

    // Convert OpenAI JSON SSE → plain text "data: <chunk>\n\n"
    const enc = (s: string) => new TextEncoder().encode(s);
    const out = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const part of completion) {
            const chunk = part.choices?.[0]?.delta?.content ?? "";
            if (chunk) controller.enqueue(enc(`data: ${sanitize(chunk)}\n\n`));
          }
          controller.enqueue(enc(`event: done\ndata: [DONE]\n\n`)); // end-of-stream signal
          controller.close();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          controller.enqueue(enc(`event: error\ndata: ${msg}\n\n`));
          controller.enqueue(enc(`event: done\ndata: [DONE]\n\n`));
          controller.close();
        }
      },
    });

    return new NextResponse(out, { headers: sseHeaders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new NextResponse(`event: error\ndata: ${msg}\n\n`, {
      headers: sseHeaders,
      status: 500,
    });
  }
}