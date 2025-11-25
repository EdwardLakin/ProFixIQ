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

/* -------------------------------------------------------------------------- */
/*  Conversation mode helpers                                                 */
/* -------------------------------------------------------------------------- */

function isFollowUpThread(ms?: ClientMessage[]): boolean {
  return Boolean(ms?.some((m) => m.role === "assistant"));
}

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

/* -------------------------------------------------------------------------- */
/*  System prompt                                                             */
/* -------------------------------------------------------------------------- */

function systemFor(v: Vehicle, context?: string): string {
  const vdesc = `${v.year} ${v.make} ${v.model}`;
  const ctx = context?.trim()
    ? `\nUser Notes / Context (treat as facts unless contradicted):\n${context.trim()}`
    : "";

  return [
    `You are a master automotive technician assistant for a ${vdesc}.`,
    `Write clean Markdown ONLY (no code fences). Use headings and real line breaks.`,
    ``,
    `INTENT CLASSIFICATION:`,
    `- If the user asks to **remove, replace, rebuild, install, service, reseal, adjust, set backlash/preload**, or says "how to" / "procedure" for a specific component (e.g., front differential, timing cover, struts):`,
    `  → Treat it as a **specific repair operation**.`,
    `- If the user is clearly asking "what's wrong", "how to diagnose", or describing symptoms without a chosen repair:`,
    `  → Treat it as **diagnosis / general guidance**.`,
    ``,
    `OUTPUT FORMATS:`,
    ``,
    `A. Diagnosis / general questions (symptoms, no specific component operation):`,
    `  ### Summary`,
    `  - 1–3 concise bullets`,
    ``,
    `  ### Procedure`,
    `  1. Step`,
    `  2. Step`,
    `  3. Step`,
    ``,
    `  ### Notes / Cautions`,
    `  - Short bullets (specs, cautions, checks)`,
    ``,
    `B. Repair operation (remove / replace / rebuild / install a specific part):`,
    `  Always use this for clear component procedures like "How do I rebuild the front differential?".`,
    ``,
    `  ### Overview`,
    `  - 1–2 bullets describing the task and when it's required`,
    ``,
    `  ### Required Tools`,
    `  - Compact bullet list (lift/jack stands, sockets, pullers, press, dial indicator, torque wrench, etc. as relevant)`,
    ``,
    `  ### Procedure`,
    `  1. Preparation / safety`,
    `  2. Remove related components (wheels, brakes, shafts, etc.)`,
    `  3. Remove the component from the vehicle`,
    `  4. Disassemble and mark parts for reassembly`,
    `  5. Inspect / replace parts (gears, bearings, seals, shims, etc.)`,
    `  6. Reassemble with correct adjustments (backlash, preload, torque)`,
    `  7. Reinstall in vehicle`,
    `  8. Fill fluids and road test`,
    ``,
    `  ### Key Specs (Typical — verify in OE service info)`,
    `  - Typical torque ranges for major fasteners`,
    `  - Typical backlash / preload ranges when applicable`,
    `  - Fluid type and approximate capacity when applicable`,
    ``,
    `  ### Notes / Cautions`,
    `  - Marking gears/shims before removal`,
    `  - Crush sleeve / pinion nut handling if used`,
    `  - Safety checks / leak checks / noise checks`,
    ``,
    `MECHANICAL CONSISTENCY RULES:`,
    `- Include **typical torque values** whenever major fasteners are removed/installed (mark them as Typical).`,
    `- Include **fluid type and approximate volume** whenever a differential, transfer case, engine oil, or cooling system is serviced (mark as Typical).`,
    `- For gear sets and differentials, mention **backlash** and **bearing preload** setups when relevant.`,
    `- If an exact OE spec isn't known, give a safe **typical range** and explicitly instruct to verify in OE service information.`,
    `- Never invent brand-specific "special procedures"; keep things generic but professional.`,
    ``,
    `FOLLOW-UP MODE (all turns AFTER your first reply):`,
    `- Answer **only** the latest user question.`,
    `- Do **not** repeat previous Summary / Procedure / Notes unless explicitly asked.`,
    `- If the user says "more detail" or similar on a repair, expand the **Procedure** and **Key Specs** sections only.`,
    `- If the user asks “what next” or “what first”, return a short **priority checklist**, not a full new diagnosis.`,
    ``,
    `STYLE:`,
    `- Prefer short paragraphs and bullet lists.`,
    `- Keep language technician-friendly, not academic.`,
    `- Never include transport markers like "event: done" or "[DONE]".`,
    ctx,
  ].join("\n");
}

function toOpenAIMessage(m: ClientMessage): ChatCompletionMessageParam {
  return Array.isArray(m.content) ? { role: "user", content: m.content } : m;
}

/* -------------------------------------------------------------------------- */
/*  Route handler                                                             */
/* -------------------------------------------------------------------------- */

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

    // Determine conversation mode
    const newTopic = userRequestedNewTopic(body.messages);
    const followUpMode = !newTopic && isFollowUpThread(body.messages);

    // Build system message with mode baked in
    const baseSystem = systemFor(body.vehicle, body.context);
    const followUpAddendum = followUpMode
      ? [
          ``,
          `You are in **FOLLOW-UP MODE**. Enforce these constraints strictly:`,
          `- Answer **only** the latest user message.`,
          `- Do **not** re-print earlier Summary/Procedure/Notes sections unless explicitly requested.`,
          `- When the user asks for "more detail", expand the **procedure** and **key specs** rather than starting over.`,
        ].join("\n")
      : "";

    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: `${baseSystem}${followUpAddendum}` },
      ...(body.messages ?? []).map(toOpenAIMessage),
    ];

    // Optional image from client
    if (body.image_data?.startsWith("data:")) {
      messages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: "Photo uploaded (use only if relevant to the latest question).",
          },
          { type: "image_url", image_url: { url: body.image_data } },
        ],
      } as unknown as ChatCompletionMessageParam);
    }

    const followUp = followUpMode;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: followUp ? 0.15 : 0.18,
      top_p: 0.9,
      frequency_penalty: 0.6,
      presence_penalty: 0.0,
      max_tokens: 900,
      messages,
    });

    const raw = completion.choices?.[0]?.message?.content ?? "";
    const text = sanitize(raw);

    return NextResponse.json({ text });
  } catch (err) {
    console.error("assistant/answer error:", err);
    return NextResponse.json(
      { error: "Assistant failed" },
      { status: 500 },
    );
  }
}