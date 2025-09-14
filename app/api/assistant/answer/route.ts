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
  image_data?: string | null; // optional base64 data URL for photos
}

const sanitize = (s: string) =>
  String(s).replace(/\b(event:\s*done|data:\s*\[DONE\])\b/gi, "").trim();

const hasVehicle = (v?: Vehicle): v is Vehicle =>
  Boolean(v?.year && v?.make && v?.model);

function systemFor(v: Vehicle, context?: string): string {
  const vdesc = `${v.year} ${v.make} ${v.model}`;
  const ctx = context?.trim() ? `\nShop Notes:\n${context.trim()}` : "";

  return [
    `You are a master automotive technician assistant for a ${vdesc}.`,
    ``,
    `Write **clean Markdown** ONLY (no code fences). Use proper headings and real line breaks.`,
    `Rules for answers (CRITICAL):`,
    `- Focus **only on the user's latest message**. Do NOT repeat previous sections unless explicitly requested.`,
    `- If the ask is *narrow* (e.g., one spec/torque/tool), respond with a small heading + bullet(s)/table only.`,
    `- If a spec can vary by trim/VIN, mark numbers as **Typical** and say to verify in OE service info.`,
    `- Prefer short, scannable bullets. No transport markers like "event: done" or "[DONE]".`,
    `- When appropriate, reference **Shop Notes** provided by the user.`,
    ``,
    `For broad diagnosis/repair questions, format as:`,
    `### Summary`,
    `- 1–3 bullets`,
    ``,
    `### Procedure`,
    `1. Step`,
    `2. Step`,
    `3. Step`,
    ``,
    `### Notes / Cautions`,
    `- Short bullets (specs, cautions, checks)`,
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

    // Keep only the last 6 turns to prevent rehashing giant history.
    const history = (body.messages ?? []).slice(-6).map(toOpenAIMessage);

    // Add a compact user "Shop Notes" turn right before the latest ask, so follow-ups leverage notes.
    if (body.context && body.context.trim().length > 0) {
      history.push({
        role: "user",
        content: `Shop Notes (use for context, don't reprint verbatim): ${body.context.trim()}`,
      });
    }

    // If a photo was uploaded this turn, add it as a hint.
    if (body.image_data?.startsWith("data:")) {
      history.push({
        role: "user",
        content: [
          { type: "text", text: "Photo uploaded for reference." },
          { type: "image_url", image_url: { url: body.image_data } },
        ],
      } as unknown as ChatCompletionMessageParam);
    }

    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemFor(body.vehicle, body.context) },
      ...history,
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.4,
      max_tokens: 900,
      messages,
    });

    const raw = completion.choices?.[0]?.message?.content ?? "";
    const text = sanitize(raw);

    return NextResponse.json({ text });
  } catch (err) {
    console.error("assistant/answer error:", err);
    return NextResponse.json({ error: "Assistant failed" }, { status: 500 });
  }
}