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
  return `
You are a master automotive technician assistant for a ${vdesc}.
Answer like you’re guiding a working tech: clear, step-wise, and accurate. Use Markdown only (no code fences).

When the user asks for **procedures**:
### Summary
- 1–3 bullets (goal, key risk/decision)

### Tools & Prep
- Special tools, fluids, parts, lift/battery steps, safety

### Procedure
- If removal/installation: use #### Removal / #### Installation
- Include **fastener sizes**, **torque values** (mark **Typical** if they vary), and sequences
- Each step = one action + expected outcome/check

### Verification / Tests
- Functional checks, road test, scan-tool, relearns

### Notes / Cautions
- Safety, re-use/replace rules, critical specs

Follow-ups (CRITICAL):
- Answer **only the latest question**. Do **not** repeat earlier procedures unless asked.
- For narrow asks (e.g. one torque): a short heading + 2–6 bullets max.

Specs & Safety:
- If a value can vary, mark as **Typical** and instruct to confirm in OE info (VIN/trim).
- Always show units; call out hazards as **WARNING** bullets.

${ctx}

Never include transport markers like "event: done" or "[DONE]".
`.trim();
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

    // Build transcript
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemFor(body.vehicle, body.context) },
      ...(body.messages ?? []).map(toOpenAIMessage),
    ];

    // If a photo was uploaded this turn, hint it in-line
    if (body.image_data?.startsWith("data:")) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: "Photo uploaded (use for context)." },
          { type: "image_url", image_url: { url: body.image_data } },
        ],
      });
    }

    // === FOLLOW-UP GUARD (forces answer to the last user turn) ===
    const lastUser = [...(body.messages ?? [])]
      .reverse()
      .find(m => m.role === "user" && typeof m.content === "string") as
      | { role: "user"; content: string }
      | undefined;

    if (lastUser?.content) {
      messages.push({
        role: "system",
        content:
          `Respond **only** to the following last user turn. ` +
          `Do not restate previous procedures unless explicitly requested. ` +
          `Keep the answer as focused and short as possible for this ask.\n\n` +
          `Last user message:\n"""${lastUser.content.trim()}"""`,
      });
    }
    // ============================================================

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.25,          // tighter, reduces rambles
      max_tokens: 700,            // keeps follow-ups concise
      frequency_penalty: 0.3,     // discourages repetition
      presence_penalty: 0.0,
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