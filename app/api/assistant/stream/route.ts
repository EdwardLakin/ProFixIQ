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
  image_data?: string; // optional base64 from client
}

const sseHeaders: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

const hasVehicle = (v?: Vehicle): v is Vehicle =>
  Boolean(v?.year && v?.make && v?.model);

// remove any transport tokens if the model ever echoes them
const sanitize = (s: string) =>
  s.replace(/\b(event:\s*done|data:\s*\[DONE\])\b/gi, "");

function systemFor(v: Vehicle, context?: string): string {
  const vdesc = `${v.year} ${v.make} ${v.model}`;
  const ctx = context?.trim() ? `\nContext:\n${context.trim()}` : "";

  return [
    `You are a master automotive technician assistant for a ${vdesc}.`,
    `Always reply in **clean Markdown** with proper line breaks.`,

    // Default structured procedure format
    `When asked for procedures, use exactly these sections:`,
    `### Summary`,
    `- 1–2 bullets`,
    ``,
    `### Procedure`,
    `1. Step`,
    `2. Step`,
    `3. Step`,
    ``,
    `### Notes / Cautions`,
    `- Bulleted list of cautions/specs`,

    // 👇 NEW: specs/torque table directive
    ``,
    `When the latest question asks for a spec (e.g., **torque**, **gap**, **pressure**, **size**, **voltage**, **resistance**):`,
    `- Answer concisely using a **Markdown table** first, then (only if needed) a 1–2 bullet note.`,
    `- Table columns: **Item** | **Spec** | **Notes**.`,
    `- Include units and **both metric and imperial** where relevant (e.g., 30 N·m (22 ft·lb)).`,
    `- If an exact OE number depends on VIN/engine/trim, give a **Typical** range and say “Verify in OE service info” plus where to find it.`,
    ``,

    `Follow-up behavior (CRITICAL):`,
    `- Answer **only the latest question**. Do not repeat earlier procedures unless explicitly requested.`,
    `- Never include transport markers like "event: done" or "[DONE]".`,
    ctx,
  ].join("\n");
}

function toOpenAIMessage(m: ClientMessage): ChatCompletionMessageParam {
  return Array.isArray(m.content) ? { role: "user", content: m.content } : m;
}

const enc = (s: string) => new TextEncoder().encode(s);
const lineSafe = (s: unknown) => String(s).replace(/[\r\n]+/g, " ");

// Simple detector to nudge formatting for spec questions
const SPEC_RE = /\b(torque|spec|specs|gap|clearance|pressure|size|voltage|resistance|ohms|amp|current|psi|bar|kpa|nm|ft[-\s]?lb)\b/i;

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

    // Base conversation
    const baseMessages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemFor(body.vehicle, body.context) },
      ...(body.messages ?? []).map(toOpenAIMessage),
    ];

    // Wrap the latest user turn so the model focuses on it,
    // and inject a **table format hint** for spec-type questions.
    const lastUserIndex = [...(body.messages ?? [])]
      .map((m, i) => ({ m, i }))
      .reverse()
      .find((x) => !Array.isArray(x.m.content) && x.m.role === "user")?.i;

    let messages = baseMessages;
    if (typeof lastUserIndex === "number") {
      const last = baseMessages[lastUserIndex + 1]; // +1 because we prefixed system
      if (last && last.role === "user" && typeof last.content === "string") {
        const isSpec = SPEC_RE.test(last.content);
        const extra =
          isSpec
            ? [
                ``,
                `Format for this question:`,
                `- Start with a **Markdown table** using columns: Item | Spec | Notes.`,
                `- Include metric + imperial units where relevant.`,
                `- Keep it concise; no repeated background.`,
              ].join("\n")
            : [
                ``,
                `Format for this question:`,
                `- Use headings and bullet/numbered lists.`,
                `- Do not repeat prior content.`,
              ].join("\n");

        const wrapped = [`Question: ${last.content.trim()}`, extra].join("\n");
        messages = baseMessages.slice();
        messages[lastUserIndex + 1] = { role: "user", content: wrapped };
      }
    }

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