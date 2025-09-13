export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---- Types ----
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
  image_data?: string | null; // data URL we may append to the last user turn
}

// ---- SSE headers ----
const sseHeaders: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

// ---- Helpers ----
const hasVehicle = (v?: Vehicle): v is Vehicle =>
  Boolean(v?.year && v?.make && v?.model);

// strip any control markers that may slip through
const sanitize = (s: string) =>
  s.replace(/\b(event:\s*done|data:\s*\[DONE\])\b/gi, "");

// System prompt geared for bullet/numbered lists + follow-ups
function systemFor(v: Vehicle, context?: string): string {
  const vdesc = `${v.year} ${v.make} ${v.model}`;
  const ctx = context?.trim() ? `\nContext:\n${context.trim()}` : "";

  return [
    `You are a master automotive diagnostic assistant for a ${vdesc}.`,
    `Write clean **Markdown** (headings, bullet points, numbered steps).`,
    `When the user asks for diagnostic or repair steps, structure as:`,
    `### Summary`,
    `- 1–2 bullets on likely cause(s) / goal`,
    ``,
    `### Procedure`,
    `1. Step with action + what to observe`,
    `2. Decision/branch when relevant`,
    `3. Continue until resolution`,
    ``,
    `### Notes / Cautions`,
    `- Specs, typical ranges (label as **Typical**), safety cautions`,
    ``,
    `Follow-ups: Answer only the latest question without repeating prior full procedure unless asked.`,
    `Do **not** include transport artifacts like "event: done" or "data: [DONE]".`,
    ctx,
  ].join("\n");
}

function toOpenAIMessage(m: ClientMessage): ChatCompletionMessageParam {
  return Array.isArray(m.content) ? { role: "user", content: m.content } : m;
}

const enc = (s: string) => new TextEncoder().encode(s);
const oneline = (s: unknown) => String(s).replace(/[\r\n]+/g, " ");

// ---- Route ----
export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return new NextResponse(
        `event: error\ndata: Missing OPENAI_API_KEY\n\nevent: done\ndata: [DONE]\n\n`,
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

    // Build message list (optionally append image data to the latest user turn)
    const baseMessages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemFor(body.vehicle, body.context) },
      ...(body.messages ?? []).map(toOpenAIMessage),
    ];

    let messages = baseMessages;

    if (body.image_data && typeof body.image_data === "string") {
      // add an extra user turn with the image so it’s considered for this call
      const imgPart: ImagePart = { type: "image_url", image_url: { url: body.image_data } };
      messages = [
        ...baseMessages,
        { role: "user", content: [imgPart] } as ChatCompletionMessageParam,
      ];
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.5,
      stream: true,
      messages,
    });

    // Micro-batching stream: flush every ~60ms for smoother typing & spacing
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let pending = "";
        let timer: number | null = null;

        const flush = () => {
          if (!pending) return;
          controller.enqueue(enc(`data: ${pending}\n\n`));
          pending = "";
        };

        const schedule = () => {
          if (timer !== null) return;
          // @ts-expect-error – setTimeout return type differs in edge
          timer = setTimeout(() => {
            timer = null;
            flush();
          }, 60);
        };

        try {
          for await (const part of completion) {
            const delta = part.choices?.[0]?.delta?.content ?? "";
            if (!delta) continue;

            // accumulate, sanitize small control fragments
            pending += sanitize(delta);
            schedule();
          }
          flush();
          controller.enqueue(enc(`event: done\ndata: [DONE]\n\n`));
          controller.close();
        } catch (err) {
          controller.enqueue(enc(`event: error\ndata: ${oneline((err as Error).message)}\n\n`));
          controller.enqueue(enc(`event: done\ndata: [DONE]\n\n`));
          controller.close();
                } finally {
          if (timer !== null) {
            clearTimeout(timer as unknown as number);
          }
        }
      },
    });

    return new NextResponse(stream, { headers: sseHeaders });
  } catch (err) {
    return new NextResponse(
      `event: error\ndata: ${oneline((err as Error).message)}\n\nevent: done\ndata: [DONE]\n\n`,
      { headers: sseHeaders, status: 500 },
    );
  }
}