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
  image_data?: string | null; // base64 data URL for photos (optional)
}

const sanitize = (s: string) =>
  String(s).replace(/\b(event:\s*done|data:\s*\[DONE\])\b/gi, "").trim();

const hasVehicle = (v?: Vehicle): v is Vehicle =>
  Boolean(v?.year && v?.make && v?.model);

// System prompt focused on bullet/numbered Markdown and follow-up discipline
function systemFor(v: Vehicle, context?: string): string {
  const vdesc = `${v.year} ${v.make} ${v.model}`;
  const ctx = context?.trim() ? `\nContext (shop notes):\n${context.trim()}` : "";
  return [
    `You are a master automotive technician assistant for a ${vdesc}.`,
    `Write clean **Markdown** only (no code fences). Use real headings and line breaks.`,
    ``,
    `Format rules:`,
    `- For broad diagnosis/repair:`,
    `  ### Summary`,
    `  - 1–3 concise bullets`,
    `  `,
    `  ### Procedure`,
    `  1. Step`,
    `  2. Step`,
    `  3. Step`,
    `  `,
    `  ### Notes / Cautions`,
    `  - Short bullets (typical specs, cautions, decision points)`,
    `- For narrow follow-ups (e.g., torque spec, one step), answer **only the new question** with a short heading + bullets. Do **not** repeat earlier sections.`,
    ``,
    `If a spec varies by trim/VIN, label numbers as **Typical** and tell where to verify in OE service info.`,
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

    const body: Body = await req.json();

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

    if (body.image_data?.startsWith("data:")) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: "Photo uploaded (use if relevant)." },
          { type: "image_url", image_url: { url: body.image_data } },
        ],
      } as ChatCompletionMessageParam);
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