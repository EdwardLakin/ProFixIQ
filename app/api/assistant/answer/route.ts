// app/api/assistant/answer/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionContentPart,
} from "openai/resources/chat/completions";

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

// --- Follow-up detection rules ---------------------------------------------

/** Follow-up mode if there is ANY assistant message already present. */
function isFollowUpThread(ms?: ClientMessage[]): boolean {
  return Boolean(ms?.some((m) => m.role === "assistant"));
}

/** Allow the user to force a brand new topic. */
function userRequestedNewTopic(ms?: ClientMessage[]): boolean {
  if (!ms?.length) return false;
  const last = ms[ms.length - 1];
  if (typeof last?.content !== "string") return false;
  const t = last.content.toLowerCase().trim();
  return (
    t.startsWith("new topic") ||
    t.startsWith("start over") ||
    t.startsWith("reset topic") ||
    t.startsWith("different vehicle") ||
    t.startsWith("new vehicle")
  );
}

// --- Prompt scaffolding -----------------------------------------------------

function systemFor(v: Vehicle, context?: string): string {
  const vdesc = `${v.year} ${v.make} ${v.model}`;
  const ctx = context?.trim()
    ? `\nUser Notes / Context (treat as facts unless contradicted):\n${context.trim()}`
    : "";

  return [
    `You are a master automotive technician assistant for a ${vdesc}.`,
    `Write clean **Markdown** ONLY (no code fences). Use headings and real line breaks.`,
    ``,
    `INITIAL QUESTION (first answer only):`,
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
    `  - Short bullets (specs, cautions, checks)`,
    ``,
    `FOLLOW-UP MODE (all turns AFTER your first reply):`,
    `- Answer **only** the user's latest question. **Do not** repeat previous sections.`,
    `- If the ask is removal/installation, include a **compact numbered procedure** and **typical torque specs** relevant to that operation.`,
    `- Mark variable specs as **Typical** and advise verifying in OE service info.`,
    `- If the user asks “what next” or “what first”, return a short **priority checklist** not a full re-diagnosis.`,
    `- Prefer bullets and short sentences. Avoid re-stating prior Summary/Procedure.`,
    ``,
    `Never include transport markers like "event: done" or "[DONE]".`,
    ctx,
  ].join("\n");
}

function toOpenAIMessage(m: ClientMessage): ChatCompletionMessageParam {
  return Array.isArray(m.content) ? { role: "user", content: m.content } : m;
}

// --- Route ------------------------------------------------------------------
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

    // Determine conversation mode
    const newTopic = userRequestedNewTopic(body.messages);
    const followUpMode = !newTopic && isFollowUpThread(body.messages);

    // Build system message with mode baked in
    const baseSystem = systemFor(body.vehicle, body.context);

    const followUpAddendum = followUpMode
      ? [
          ``,
          `You are in **FOLLOW-UP MODE**. Constraints to enforce:`,
          `- Answer **only** the latest user message.`,
          `- Do **not** re-print earlier Summary/Procedure/Notes.`,
          `- Be specific and compact. Include typical torque/specs if applicable.`,
        ].join("\n")
      : "";

    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: `${baseSystem}${followUpAddendum}` },
      ...(body.messages ?? []).map(toOpenAIMessage),
    ];

    // Properly typed photo hint (no `any`)
    if (body.image_data?.startsWith("data:")) {
      const photoParts: ChatCompletionContentPart[] = [
        { type: "text", text: "Photo uploaded (use only if relevant to the latest question)." },
        { type: "image_url", image_url: { url: body.image_data } },
      ];
      messages.push({ role: "user", content: photoParts });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      // Tighter for follow-ups to reduce drift & repetition
      temperature: followUpMode ? 0.2 : 0.35,
      top_p: 0.9,
      frequency_penalty: 0.7, // discourage repeating prior phrasing
      presence_penalty: 0.0,
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