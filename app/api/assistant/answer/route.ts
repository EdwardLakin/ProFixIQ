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
  image_data?: string | null; // optional base64 data URL for photos
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
    ``,
    `Always read the entire conversation and use the latest vehicle details + context.`,
    `When the user asks a follow-up, answer **only the new question** and do not repeat prior procedures unless the user asks.`,
    `If specs vary by VIN/trim, label numbers as **Typical** and advise verifying in OE service info.`,
    ``,
    `Write **clean Markdown** ONLY (no code fences). Use headings and line breaks.`,
    `For broad diagnosis/repair, structure as:`,
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
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY" },
        { status: 500 },
      );
    }

    const body = (await req.json()) as Body;

    if (!hasVehicle(body.vehicle)) {
      return NextResponse.json(
        { error: "Missing vehicle (year/make/model)" },
        { status: 400 },
      );
    }

    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemFor(body.vehicle, body.context) },
      ...(body.messages ?? []).map(toOpenAIMessage),
    ];

    // If a photo was uploaded this turn, add a compact hint turn including the image (typed, no 'any').
    if (body.image_data?.startsWith("data:")) {
      const photoTurn: { role: "user"; content: (TextPart | ImagePart)[] } = {
        role: "user",
        content: [
          { type: "text", text: "Photo uploaded (use for context)." },
          { type: "image_url", image_url: { url: body.image_data } },
        ],
      };
      messages.push(photoTurn);
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.4,
      messages,
      max_tokens: 900,
    });

    const raw = completion.choices?.[0]?.message?.content ?? "";
    const text = sanitize(raw);

    return NextResponse.json({ text });
  } catch (err) {
    console.error("assistant/answer error:", err);
    return NextResponse.json({ error: "Assistant failed" }, { status: 500 });
  }
}