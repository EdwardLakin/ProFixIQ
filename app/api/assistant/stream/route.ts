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
  // optional extras your hook may send
  prompt?: string;
  dtcCode?: string;
  image_data?: string;
  context?: string;
}

const sseHeaders: Record<string, string> = {
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
    `Your goal is to help a technician reach a correct diagnosis fast and safely.`,
    ``,
    `Style & Output`,
    `- Be concise but complete; use **Markdown** with clear sections.`,
    `- Favor checklists and stepwise flows a tech can follow in the bay.`,
    `- When appropriate, include **Estimated Labor Time** (hrs) and call out special tools.`,
    ``,
    `Reasoning Rules`,
    `- Always ground advice in measurements, symptoms, and test results the user provides.`,
    `- If critical info is missing (scan data, DTCs, fuel trims, volt/ohm/psi, scope captures), ask for it explicitly.`,
    `- Prefer **decision trees** with discriminator tests.`,
    `- For DTCs, give a brief decode, common root causes, and an ordered test plan (non-invasive → invasive).`,
    `- Never invent numbers or facts; propose what to verify next.`,
    ``,
    `Headings you should use:`,
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

    // Build messages
    const base: ChatCompletionMessageParam[] = [
      { role: "system", content: systemFor(body.vehicle) },
      ...(body.messages ?? []).map(toOpenAIMessage),
    ];

    // If the hook sent convenience fields, append them as user turns
    if (body.context?.trim()) {
      base.push({ role: "user", content: `Context:\n${body.context.trim()}` });
    }
    if (body.dtcCode) {
      base.push({ role: "user", content: `DTC: ${body.dtcCode}` });
    }
    if (body.image_data) {
      base.push({
        role: "user",
        content: [{ type: "text", text: "Photo:" }, { type: "image_url", image_url: { url: body.image_data } }],
      } as any);
    }
    if (body.prompt?.trim()) {
      base.push({ role: "user", content: body.prompt.trim() });
    }

    // Ask OpenAI for a streamed completion
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.6,
      messages: base,
      stream: true,
    });

    // Transform OpenAI's JSON SSE → plain text SSE
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        // SDK gives us a web ReadableStream of JSON lines
        const reader = completion.toReadableStream().getReader();
        const decoder = new TextDecoder();
        let buf = "";

        const flush = (text: string) => {
          controller.enqueue(encoder.encode(`data: ${text}\n\n`));
        };

        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buf += decoder.decode(value, { stream: true });

            let idx: number;
            while ((idx = buf.indexOf("\n")) !== -1) {
              const line = buf.slice(0, idx).trim();
              buf = buf.slice(idx + 1);

              if (!line || line.startsWith(":")) continue;

              // OpenAI uses "data: ..." lines already; strip the prefix if present
              const payload = line.startsWith("data:")
                ? line.slice(5).trim()
                : line;

              if (payload === "[DONE]") {
                flush("[DONE]");
                controller.close();
                return;
              }

              // Extract delta.content if available; otherwise ignore
              try {
                const json = JSON.parse(payload);
                const piece =
                  json?.choices?.[0]?.delta?.content ??
                  json?.choices?.[0]?.text ??
                  "";

                if (piece) flush(piece);
              } catch {
                // Non-JSON (shouldn't happen) → pass through
                flush(payload);
              }
            }
          }

          // end just in case
          flush("[DONE]");
          controller.close();
        } catch (e) {
          flush(JSON.stringify({ type: "error", error: (e as Error).message || "stream failed" }));
          controller.close();
        }
      },
    });

    return new NextResponse(stream, { headers: sseHeaders });
  } catch (err: any) {
    console.error("assistant/stream error:", err);
    return new NextResponse(JSON.stringify({ error: err?.message ?? "Assistant failed." }), {
      status: 500,
      headers: sseHeaders,
    });
  }
}