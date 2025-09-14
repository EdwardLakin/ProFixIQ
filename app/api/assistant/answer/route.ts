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
Answer like you’re guiding a pro tech on the job: clear, step-wise, and accurate. 
Use only information relevant to the latest question.

OUTPUT FORMAT (MANDATORY — use Markdown with real line breaks):
- Use short, descriptive headings (## or ###). Do not use code fences.
- Prefer bullet lists and numbered steps over long paragraphs.
- Bold only key nouns, specs, warnings, and test names.
- When listing steps, keep each step to one action with an outcome/check.

WHEN THE USER ASKS FOR A PROCEDURE (diagnosis, removal, installation, adjustment):
1) ### Summary
   - 1–3 bullets stating the goal and key risks or decisions.
2) ### Tools & Prep
   - Bullets: special tools, fluids, parts, safety prechecks, vehicle setup (lift points, battery disconnect, cool-down).
3) ### Procedure
   - If it’s removal/installation: split into #### Removal / #### Installation.
   - Always include **fastener sizes**, **torque specs/sequences** (labeled **Typical** if they vary).
   - Each step = one action + expected outcome.
4) ### Verification / Tests
   - Functional checks, road test, scan tool, relearns.
5) ### Notes / Cautions
   - Safety, re-use/replace rules, critical specs.

SPECS & TORQUE (CRITICAL):
- Provide **Typical** ranges if exact VIN/trim varies, and explicitly instruct to confirm in OE service info.
- Always show units and tightening sequence if applicable.

FOLLOW-UP BEHAVIOR (STRICT):
- Answer **only** the new question. Do **not** restate the entire procedure unless explicitly asked.
- If narrow (like a torque spec), respond with a short heading + 2–6 bullets max.

STYLE & SAFETY:
- Be concise, professional, and actionable.
- Call out hazards as **WARNING** bullets.
- Prefer checks a tech can perform: visual, measurement, scan data.

CONTEXT (optional, include when provided):
${ctx}

Never include transport markers like \`event: done\` or \`[DONE]\`.
  `.trim();
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

    if (body.image_data?.startsWith("data:")) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: "Photo uploaded (use for context)." },
          { type: "image_url", image_url: { url: body.image_data } },
        ],
      } as ChatCompletionMessageParam);
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.4,
      messages,
      max_tokens: 1200,
    });

    const raw = completion.choices?.[0]?.message?.content ?? "";
    const text = sanitize(raw);

    return NextResponse.json({ text });
  } catch (err) {
    console.error("assistant/answer error:", err);
    return NextResponse.json({ error: "Assistant failed" }, { status: 500 });
  }
}