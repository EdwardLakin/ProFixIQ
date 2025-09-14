// app/api/assistant/answer/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---------- Types ----------
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

// ---------- Helpers ----------
const sanitize = (s: string) =>
  String(s).replace(/\b(event:\s*done|data:\s*\[DONE\])\b/gi, "").trim();

const hasVehicle = (v?: Vehicle): v is Vehicle =>
  Boolean(v?.year && v?.make && v?.model);

const toOpenAIMessage = (m: ClientMessage): ChatCompletionMessageParam =>
  Array.isArray(m.content) ? { role: "user", content: m.content } : m;

// Single, authoritative system prompt.
// First turn = full guide. Follow-ups = expand/answer only the new question.
function systemFor(v: Vehicle, context?: string): string {
  const vdesc = `${v.year} ${v.make} ${v.model}`;
  const ctx = context?.trim() ? `\nContext:\n${context.trim()}` : "";

  return [
    `You are a master automotive technician assistant for a ${vdesc}.`,
    ``,
    `OUTPUT & FORMAT (CRITICAL)`,
    `- Write clean **Markdown only** (no code fences). Use real line breaks.`,
    `- Prefer short paragraphs, bullet lists, and numbered steps.`,
    `- Headings: use "###" level for section titles.`,
    ``,
    `FIRST QUESTION (broad diagnostic/repair):`,
    `- Provide a compact, technician-ready guide in this exact order:`,
    `  ### Summary`,
    `  - 1–3 bullets on problem/goal`,
    `  `,
    `  ### Tools & Prep`,
    `  - Tools (bullets)`,
    `  - Parts (bullets; include “if needed”)`,
    `  - Safety (bullets)`,
    `  `,
    `  ### Procedure`,
    `  1. Step name — brief action. Include **torque specs inline** where relevant (caliper bolts, bracket bolts, wheel lugs, etc.).`,
    `  2. Step name — brief action.`,
    `  3. Step name — brief action.`,
    `  `,
    `  ### Verification / Tests`,
    `  - Checks/road test/scan tool as applicable`,
    `  `,
    `  ### Notes / Cautions`,
    `  - Warnings, typical specs, what to double-check in OE info`,
    ``,
    `FOLLOW-UPS (CRITICAL):`,
    `- Treat follow-up messages as a **continuation** of the same job.`,
    `- **Do NOT** repeat prior sections (no re-stating Summary/Tools unless specifically asked).`,
    `- Answer only the **new question** and expand the relevant step(s) with exact details and **torque specs inline**.`,
    `- If user asks "what first" / "next step" → provide a short priority checklist (3–5 bullets) referencing earlier guidance.`,
    `- If the user wants a specific torque/spec that can vary by VIN/trim, give a **Typical** range and say to verify in OE service info.`,
    ``,
    `GENERAL SAFETY & CLARITY:`,
    `- Use checklists and decision points when uncertain.`,
    `- Never include transport markers like "event: done" or "[DONE]".`,
    ctx,
  ].join("\n");
}

// ---------- Route ----------
export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const body = (await req.json()) as Body;

    if (!hasVehicle(body.vehicle)) {
      return NextResponse.json(
        { error: "Missing vehicle (year/make/model)" },
        { status: 400 },
      );
    }

    // Build conversation for a single, clean completion
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemFor(body.vehicle, body.context) },
      ...(body.messages ?? []).map(toOpenAIMessage),
    ];

    // If a photo was uploaded this turn, include a concise hint + the image
    if (body.image_data && body.image_data.startsWith("data:")) {
      const imgMsg: ChatCompletionMessageParam = {
        role: "user",
        content: [
          { type: "text", text: "Photo uploaded (use for context where helpful)." },
          { type: "image_url", image_url: { url: body.image_data } },
        ],
      };
      messages.push(imgMsg);
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.35,
      max_tokens: 1100,
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