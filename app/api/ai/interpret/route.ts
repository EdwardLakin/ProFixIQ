// app/api/ai/interpret/route.ts

import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type CommandStatus = "ok" | "fail" | "na" | "recommend";

type InterpretMode = "open" | "strict_context";

type InterpretContext = {
  sectionTitle?: string;
  items?: string[];
};

type VoiceCommand =
  | {
      command: "update_status";
      section?: string;
      item?: string;
      side?: "left" | "right";
      status: CommandStatus;
      note?: string;
      notes?: string;
    }
  | {
      command: "update_value";
      section?: string;
      item?: string;
      side?: "left" | "right";
      value: number | string;
      unit?: string;
      note?: string;
      notes?: string;
    }
  | {
      command: "add_note";
      section?: string;
      item?: string;
      side?: "left" | "right";
      note: string;
      notes?: string;
    }
  | {
      command: "recommend";
      section?: string;
      item?: string;
      side?: "left" | "right";
      note: string;
      notes?: string;
    }
  | {
      command: "add_part";
      section?: string;
      item?: string;
      side?: "left" | "right";
      partName: string;
      quantity?: number;
      note?: string;
      notes?: string;
    }
  | {
      command: "add_labor";
      section?: string;
      item?: string;
      side?: "left" | "right";
      hours: number;
      label?: string;
      note?: string;
      notes?: string;
    }
  | { command: "complete_item"; section?: string; item?: string; side?: "left" | "right" }
  | { command: "skip_item"; section?: string; item?: string; side?: "left" | "right" }
  | { command: "pause_inspection" }
  | { command: "finish_inspection" };

function safeJsonParseArray(input: string): VoiceCommand[] {
  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? (parsed as VoiceCommand[]) : [];
  } catch {
    return [];
  }
}

function norm(s: unknown): string {
  return String(s ?? "").trim();
}


function findExactAllowedItem(allowed: string[], candidate: string): string | null {
  const c = candidate.trim();
  if (!c) return null;

  // exact first
  if (allowed.includes(c)) return c;

  // case-insensitive exact
  const lower = c.toLowerCase();
  const hit = allowed.find((x) => x.toLowerCase() === lower);
  return hit ?? null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as
      | { transcript?: unknown; context?: unknown; mode?: unknown }
      | null;

    const transcript = norm(body?.transcript);
    if (!transcript) return NextResponse.json([]);

    const mode = (norm(body?.mode) as InterpretMode) || "open";

    const ctxRaw = (body?.context ?? null) as InterpretContext | null;
    const ctx: InterpretContext | null =
      ctxRaw && typeof ctxRaw === "object"
        ? {
            sectionTitle: norm(ctxRaw.sectionTitle ?? ""),
            items: Array.isArray(ctxRaw.items) ? ctxRaw.items.map((x) => norm(x)).filter(Boolean) : undefined,
          }
        : null;

    const allowedItems = (ctx?.items ?? []).filter(Boolean);
    const hasContext = allowedItems.length > 0;

    const systemPromptBase = `
You are an AI assistant embedded in a vehicle inspection web app.

Your job is to convert mechanic voice transcripts into structured JSON commands that update inspection items on a form.

Rules:
- Return ONLY valid JSON (a JSON ARRAY). No markdown. No explanations.
- If unsure, return [].
- Fix common misheard phrases ("breaks" -> "brakes", "millimeter" -> "mm").
- Use synonyms: pass=ok, failed=fail, not applicable=na, recommend=recommend.
- Keep values concise and units normalized when possible.
- When you set a FAIL or RECOMMEND status, include a short note if the transcript includes a reason (leak/loose/cracked/etc).

Allowed commands:
- update_status: {"command":"update_status","section?":"...","item?":"...","status":"ok"|"fail"|"na"|"recommend","note?":"..."}
- update_value:  {"command":"update_value","section?":"...","item?":"...","value":number|string,"unit?":"mm"|"in"|"psi"|"kPa"|"ft·lb"|"...","note?":"..."}
- add_note:      {"command":"add_note","section?":"...","item?":"...","note":"..."}
- recommend:     {"command":"recommend","section?":"...","item?":"...","note":"..."}
- add_part:      {"command":"add_part","section?":"...","item?":"...","partName":"...","quantity?":number}
- add_labor:     {"command":"add_labor","section?":"...","item?":"...","hours":number,"label?":"..."}
- pause_inspection: {"command":"pause_inspection"}
- finish_inspection: {"command":"finish_inspection"}
- complete_item: {"command":"complete_item","section?":"...","item?":"..."}
- skip_item:     {"command":"skip_item","section?":"...","item?":"..."}

Examples:
"techy mark right tie rod end as failed" =>
[{"command":"update_status","item":"Tie rod ends","status":"fail","note":"right side"}]

"techy add measurement LF pads 7mm" =>
[{"command":"update_value","item":"Front brake pads","value":7,"unit":"mm","note":"LF"}]

"yes add 1 hour labor and a tie rod end" =>
[{"command":"add_part","partName":"Tie Rod End","quantity":1},{"command":"add_labor","hours":1,"label":"Labor"}]
`.trim();

    const strictContextRules = hasContext
      ? `
CONTEXT:
- The UI provides a list of allowed inspection item labels (exact strings).
- If you reference an item, you MUST choose item EXACTLY from the allowed list.
- If the transcript does not clearly match any allowed item, return [].

Allowed items:
${allowedItems.map((x) => `- ${x}`).join("\n")}

Optional section hint (may be empty): ${norm(ctx?.sectionTitle ?? "")}
`.trim()
      : "";

    const systemPrompt = [systemPromptBase, strictContextRules].filter(Boolean).join("\n\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: transcript },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "[]";
    let commands = safeJsonParseArray(raw);

    // If we are in strict mode with context, drop anything that references an unknown item.
    if (mode === "strict_context" && hasContext) {
      const allowed = allowedItems;
      commands = commands
        .map((cmd) => {
          const item = (cmd as any)?.item;
          if (!item) return cmd;

          const exact = findExactAllowedItem(allowed, String(item));
          if (!exact) return null;

          return { ...(cmd as any), item: exact } as VoiceCommand;
        })
        .filter(Boolean) as VoiceCommand[];
    }

    return NextResponse.json(commands);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/ai/interpret] error:", err);
    return NextResponse.json([]);
  }
}