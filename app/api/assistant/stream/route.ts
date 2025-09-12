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

const sseHeaders = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  // helps some proxies avoid buffering
  "X-Accel-Buffering": "no",
};

const hasVehicle = (v?: Vehicle): v is Vehicle =>
  Boolean(v?.year && v?.make && v?.model);

function systemFor(v: Vehicle, context?: string): string {
  const vdesc = `${v.year} ${v.make} ${v.model}`;
  const ctx = context?.trim() ? `\nContext:\n${context.trim()}` : "";
  return [
    `You are a master automotive technician assistant for a ${vdesc}.`,
    `Write concise **Markdown**. No greetings; answer directly.`,
    `Sections: **Summary** • **Procedure** (numbered) • **Notes/Cautions**.`,
    ctx,
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

    const withSystem: ChatCompletionMessageParam[] = [
      { role: "system", content: systemFor(body.vehicle, body.context) },
      ...(body.messages ?? []).map(toOpenAIMessage),
    ];

    const upstream = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.5,
      stream: true,
      messages: withSystem,
    });

    // Convert OpenAI JSON SSE → plain text SSE:  data: <text>\n\n
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const reader = upstream.toReadableStream().getReader();

    let buffer = "";
    const out = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let idx: number;
            while ((idx = buffer.indexOf("\n\n")) !== -1) {
              const raw = buffer.slice(0, idx).trim();
              buffer = buffer.slice(idx + 2);
              if (!raw || raw.startsWith(":")) continue;

              const line = raw.startsWith("data:") ? raw.slice(5).trim() : raw;
              if (line === "[DONE]") continue;

              // Extract delta.content if this line is JSON; otherwise pass through
              let chunk = "";
              try {
                const obj = JSON.parse(line) as {
                  choices?: Array<{ delta?: { content?: string }; text?: string }>;
                };
                chunk =
                  obj?.choices?.[0]?.delta?.content ??
                  obj?.choices?.[0]?.text ??
                  "";
              } catch {
                chunk = line;
              }

              if (chunk) {
                controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
              }
            }
          }
        } finally {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      },
    });

    return new NextResponse(out, { headers: sseHeaders });
  } catch (err) {
    console.error("assistant/stream error:", err);
    const encoder = new TextEncoder();
    const fallback = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(encoder.encode(`data: **Error:** Assistant failed to reply.\n\n`));
        c.enqueue(encoder.encode("data: [DONE]\n\n"));
        c.close();
      },
    });
    return new NextResponse(fallback, { headers: sseHeaders, status: 200 });
  }
}