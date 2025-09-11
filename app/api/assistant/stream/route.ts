// app/api/assistant/stream/route.ts
export const runtime = "edge";

import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

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

const sseHeaders = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
};

function hasVehicle(v?: Vehicle): v is Vehicle {
  return Boolean(v?.year && v?.make && v?.model);
}

function systemFor(vehicle: Vehicle): string {
  const v = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
  return [
    `You are a top-level automotive diagnostic assistant working on a ${v}.`,
    `Your goal is to help a technician reach a correct diagnosis fast and safely.`,
    ``,
    `Style & Output`,
    `- Be concise but complete; use **Markdown** with clear sections.`,
    `- Favor checklists and stepwise flows a tech can follow in the bay.`,
    ``,
    `Reasoning Rules`,
    `- Always ground advice in measurements, symptoms, and test results the user provides.`,
    `- If critical info is missing (scan data, DTCs, trims, V/A/Ω/psi, scope captures), ask for it explicitly.`,
    `- Prefer decision trees with discriminator tests.`,
    `- Never invent numbers; say what to verify next.`,
    ``,
    `Structure your replies:`,
    `**Complaint / Context**`,
    `**Observations / Data**`,
    `**Likely Causes**`,
    `**Next Tests**`,
    `**Recommended Fix**`,
    `**Estimated Labor Time**`,
  ].join("\n");
}

function toOpenAIMessage(m: ClientMessage): ChatCompletionMessageParam {
  if (Array.isArray(m.content)) return { role: "user", content: m.content };
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

    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        // Keep-alive heartbeat (every 15s)
        const hb = setInterval(() => {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        }, 15000);

        try {
          for await (const chunk of completion) {
            // Typical delta content for chat.completions:
            const piece = chunk.choices?.[0]?.delta?.content ?? "";
            if (piece) {
              controller.enqueue(encoder.encode(`data: ${piece}\n\n`));
            }

            // If the API signals finish_reason, end the stream
            const finish = chunk.choices?.[0]?.finish_reason;
            if (finish) break;
          }

          // Signal end of stream to EventSource
          controller.enqueue(encoder.encode(`event: done\ndata: [DONE]\n\n`));
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : typeof err === "string" ? err : "Stream error";
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify(msg)}\n\n`));
        } finally {
          clearInterval(hb);
          controller.close();
        }
      },
    });

    return new NextResponse(stream, { headers: sseHeaders });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : typeof err === "string" ? err : "Assistant failed.";
    return new NextResponse(JSON.stringify({ error: msg }), {
      status: 500,
      headers: sseHeaders,
    });
  }
}