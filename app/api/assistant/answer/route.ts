// app/api/assistant/answer/route.ts
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
  image_data?: string | null;
}

const sanitize = (s: string) =>
  String(s).replace(/\b(event:\s*done|data:\s*\[DONE\])\b/gi, "").trim();

const hasVehicle = (v?: Vehicle): v is Vehicle =>
  Boolean(v?.year && v?.make && v?.model);

function systemFor(v: Vehicle, context?: string): string {
  const vdesc = `${v.year} ${v.make} ${v.model}`;
  const ctx = context?.trim() ? `\nContext:\n${context.trim()}` : "";

  return [
    `You are a master automotive technician assistant for a ${vdesc}.`,
    `Write **clean Markdown only** (no code fences). Use headings and real line breaks.`,
    `If the user asks a broad question, structure as:`,
    `### Summary`,
    `- 1–3 concise bullets`,
    ``,
    `### Procedure`,
    `1. Step`,
    `2. Step`,
    `3. Step`,
    ``,
    `### Notes / Cautions`,
    `- Short bullets (specs, cautions, checks)`,
    ``,
    `If this is a **follow-up**, answer ONLY the latest user question. Do not repeat previous procedures.`,
    `If a spec varies by trim/VIN, label as **Typical** and advise confirming in OE service info.`,
    `Never include transport markers like "event: done" or "[DONE]".`,
    ctx,
  ].join("\n");
}

function toOpenAIMessage(m: ClientMessage): ChatCompletionMessageParam {
  return Array.isArray(m.content) ? { role: "user", content: m.content } : m;
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const body = (await req.json()) as Body;
    if (!hasVehicle(body.vehicle)) {
      return NextResponse.json({ error: "Missing vehicle (year/make/model)" }, { status: 400 });
    }

    const history = (body.messages ?? []).map(toOpenAIMessage);

    // Find the latest user message (this is what we want answered).
    const lastUser = [...history].reverse().find((m) => m.role === "user");
    const latestQuestion =
      typeof lastUser?.content === "string" ? lastUser.content.trim() : "(no text)";

    // Keep a small amount of context to stay on topic, but not enough to cause repeats.
    // (system + last 6 turns)
    const trimmedHistory = history.slice(-6);

    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemFor(body.vehicle, body.context) },
      ...trimmedHistory,
    ];

    if (body.image_data?.startsWith("data:")) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: "Photo uploaded (use for context if relevant)." },
          { type: "image_url", image_url: { url: body.image_data } },
        ],
      });
    }

    // Final “pin” turn so the model focuses ONLY on this question
    messages.push({
      role: "user",
      content: `Latest question to answer only:\n${latestQuestion}`,
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.35,
      max_tokens: 900,
      messages,
    });

    const raw = completion.choices?.[0]?.message?.content ?? "";
    return NextResponse.json({ text: sanitize(raw) });
  } catch (err) {
    console.error("assistant/answer error:", err);
    return NextResponse.json({ error: "Assistant failed" }, { status: 500 });
  }
}