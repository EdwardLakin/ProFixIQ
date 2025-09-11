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
  const vdesc = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
  return [
    `You are a top-level automotive diagnostic assistant working on a ${vdesc}.`,
    `Goal: give a technician the next actionable steps, safely and succinctly.`,
    ``,
    `Response Modes`,
    `- **Procedure mode (default when the user asks "how to replace / procedure / steps")**:`,
    `  Return ONLY a short, numbered procedure (6–12 steps) with key safety notes and any known torque values/specs. No long preamble, no sections. ≤ 200 words.`,
    `- **Brief diagnostic mode (all other questions)**:`,
    `  Use compact Markdown sections: Complaint, Likely Causes (≤3), Next Tests (bulleted, concrete hookups/specs), and Recommended Fix. Keep it tight (≤ 220 words).`,
    ``,
    `General Rules`,
    `- Never invent specs; if unsure, say "verify spec for this VIN/engine".`,
    `- Ask for missing critical data only when it truly blocks the next step (DTCs, key readings, scope captures).`,
    `- Prefer checklists and stepwise flows a tech can follow in-bay.`,
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
  temperature: 0.3,          // crisper, less wordy
  max_tokens: 380,            // hard ceiling on length
  presence_penalty: 0,        // avoid topic wandering
  frequency_penalty: 0.2,     // reduce repetition
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