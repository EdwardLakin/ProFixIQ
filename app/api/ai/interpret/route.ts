// /app/api/ai/interpret/route.ts (FULL FILE REPLACEMENT)
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
  sectionTitles?: string[];
  items?: string[];
};

type OneShotPart = { description: string; qty: number };

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
  | {
      /** ✅ apply status to ALL items in a section */
      command: "section_status";
      section: string;
      status: CommandStatus;
      note?: string;
      notes?: string;
    }
  | {
      /**
       * ✅ One-shot item mutation (status + notes + parts + labor in one command).
       */
      command: "oneshot_item";
      section?: string;
      item?: string;
      status: CommandStatus;
      note?: string;
      notes?: string;
      parts?: OneShotPart[];
      laborHours?: number | null;
    }
  | { command: "complete_item"; section?: string; item?: string; side?: "left" | "right" }
  | { command: "skip_item"; section?: string; item?: string; side?: "left" | "right" }
  | { command: "pause_inspection" }
  | { command: "finish_inspection" };

function norm(s: unknown): string {
  return String(s ?? "").trim();
}

function parseInterpretMode(input: unknown): InterpretMode {
  const v = norm(input).toLowerCase();
  if (v === "strict_context") return "strict_context";
  return "open";
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function getString(o: Record<string, unknown>, key: string): string | undefined {
  const v = o[key];
  return typeof v === "string" ? v : undefined;
}

function getStringArray(o: Record<string, unknown>, key: string): string[] | undefined {
  const v = o[key];
  if (!Array.isArray(v)) return undefined;
  const out: string[] = [];
  for (const it of v) {
    if (typeof it === "string") out.push(it);
  }
  return out;
}

function safeJsonParseArray(input: string): VoiceCommand[] {
  try {
    const parsed: unknown = JSON.parse(input);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is VoiceCommand => {
      if (!isRecord(x)) return false;
      return typeof x.command === "string";
    });
  } catch {
    return [];
  }
}

function isBodyShape(
  x: unknown,
): x is { transcript?: unknown; context?: unknown; mode?: unknown } {
  return isRecord(x);
}

function findExactAllowedItem(allowed: string[], candidate: string): string | null {
  const c = candidate.trim();
  if (!c) return null;

  if (allowed.includes(c)) return c;

  const lower = c.toLowerCase();
  const hit = allowed.find((x) => x.toLowerCase() === lower);
  return hit ?? null;
}

function withExactItem(cmd: VoiceCommand, exactItem: string): VoiceCommand {
  if (!("item" in cmd)) return cmd;
  return { ...cmd, item: exactItem } as VoiceCommand;
}

/**
 * Normalize notes -> note (client prefers note, but we keep both fields for compatibility)
 */
function normalizeNoteFields(cmd: VoiceCommand): VoiceCommand {
  if (!isRecord(cmd)) return cmd;

  const note = "note" in cmd ? cmd.note : undefined;
  const notes = "notes" in cmd ? cmd.notes : undefined;

  const noteStr = typeof note === "string" ? note : "";
  const notesStr = typeof notes === "string" ? notes : "";

  if (!noteStr && notesStr) {
    return { ...cmd, note: notesStr } as VoiceCommand;
  }

  return cmd;
}

/* -------------------------------------------------------------------------------------------------
 * ✅ Fuzzy mapping for strict_context (safe, deterministic)
 * ------------------------------------------------------------------------------------------------- */

function nrm(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s: string): string[] {
  const t = nrm(s);
  if (!t) return [];
  return t.split(" ").filter((w) => w.length >= 2);
}

function scoreCandidateToAllowed(candidate: string, allowedLabel: string): number {
  const c = nrm(candidate);
  const a = nrm(allowedLabel);
  if (!c || !a) return 0;

  // Exact-ish bonuses
  if (a === c) return 999;
  if (a.includes(c) || c.includes(a)) return 120;

  // Token overlap
  const ct = tokenize(c);
  const at = tokenize(a);

  const aSet = new Set(at);

  let overlap = 0;
  for (const tok of ct) {
    if (aSet.has(tok)) overlap += 1;
  }

  // Weighted keywords that matter a lot for grids
  const keyBoost = (tok: string, w: number) => {
    if (c.includes(tok) && a.includes(tok)) overlap += w;
  };

  keyBoost("tread", 2);
  keyBoost("depth", 2);
  keyBoost("pressure", 2);
  keyBoost("steer", 2);
  keyBoost("drive", 2);
  keyBoost("tag", 2);
  keyBoost("left", 1);
  keyBoost("right", 1);
  keyBoost("inner", 1);
  keyBoost("outer", 1);

  // Convert overlap into a score
  // - base overlap matters
  // - bonus if candidate tokens mostly covered by allowed label
  const coverage =
    ct.length > 0 ? overlap / Math.max(1, ct.length) : 0;

  const score = overlap * 10 + Math.round(coverage * 30);

  return score;
}

function findBestAllowedItem(allowed: string[], candidate: string): string | null {
  const exact = findExactAllowedItem(allowed, candidate);
  if (exact) return exact;

  const cand = candidate.trim();
  if (!cand) return null;

  let best: { label: string; score: number } | null = null;

  for (const a of allowed) {
    const s = scoreCandidateToAllowed(cand, a);
    if (s <= 0) continue;
    if (!best || s > best.score) best = { label: a, score: s };
  }

  // ✅ Confidence floor: prevents random writes
  // If your labels are very long/structured, you can lower this slightly.
  if (!best || best.score < 55) return null;

  return best.label;
}

/* ------------------------------------------------------------------------------------------------- */

export async function POST(req: Request) {
  try {
    const rawBody: unknown = await req.json().catch(() => null);
    const body = isBodyShape(rawBody)
      ? (rawBody as { transcript?: unknown; context?: unknown; mode?: unknown })
      : null;

    const transcript = norm(body?.transcript);
    if (!transcript) return NextResponse.json([]);

    const mode = parseInterpretMode(body?.mode);

    // ✅ No "any": parse context safely
    const ctxCandidate: unknown = body?.context ?? null;
    let ctx: InterpretContext | null = null;

    if (isRecord(ctxCandidate)) {
      const sectionTitleRaw = getString(ctxCandidate, "sectionTitle");
      const sectionTitlesRaw = getStringArray(ctxCandidate, "sectionTitles");
      const itemsRaw = getStringArray(ctxCandidate, "items");

      const sectionTitle = norm(sectionTitleRaw ?? "");
      const sectionTitles = Array.isArray(sectionTitlesRaw)
        ? sectionTitlesRaw.map((x) => norm(x)).filter(Boolean)
        : undefined;

      const items = Array.isArray(itemsRaw)
        ? itemsRaw.map((x) => norm(x)).filter(Boolean)
        : undefined;

      ctx = { sectionTitle, sectionTitles, items };
    }

    const allowedItems = (ctx?.items ?? []).filter(Boolean);
    const hasContext = allowedItems.length > 0;

    const systemPromptBase = `
You are an AI assistant embedded in a vehicle inspection web app.

Your job is to convert mechanic voice transcripts into structured JSON commands that update inspection items on a form.

Rules:
- Return ONLY valid JSON (a JSON ARRAY). No markdown. No explanations.
- If unsure, return [].
- Fix common misheard phrases ("breaks" -> "brakes", "millimeter" -> "mm").
- Use synonyms: pass=ok, okay=ok, failed=fail, not applicable=na, recommend=recommend, rec=recommend.
- Keep values concise and units normalized when possible.
- When you set a FAIL or RECOMMEND status, include a short note if the transcript includes a reason (leak/loose/cracked/worn/etc).

IMPORTANT:
- Prefer "oneshot_item" when a single utterance includes status + reason + parts and/or labor.
  Example: "fail left tie rod worn out, 1 hour labor, left tie rod end" =>
  [{"command":"oneshot_item","item":"Tie rod ends","status":"fail","note":"left tie rod worn out","laborHours":1,"parts":[{"description":"Left tie rod end","qty":1}]}]

Allowed commands:
- update_status: {"command":"update_status","section?":"...","item?":"...","status":"ok"|"fail"|"na"|"recommend","note?":"..."}
- update_value:  {"command":"update_value","section?":"...","item?":"...","value":number|string,"unit?":"mm"|"in"|"psi"|"kPa"|"ft·lb"|"...","note?":"..."}
- add_note:      {"command":"add_note","section?":"...","item?":"...","note":"..."}
- recommend:     {"command":"recommend","section?":"...","item?":"...","note":"..."}
- add_part:      {"command":"add_part","section?":"...","item?":"...","partName":"...","quantity?":number}
- add_labor:     {"command":"add_labor","section?":"...","item?":"...","hours":number,"label?":"..."}
- section_status: {"command":"section_status","section":"...","status":"ok"|"fail"|"na"|"recommend","note?":"..."}
- oneshot_item:  {"command":"oneshot_item","section?":"...","item?":"...","status":"ok"|"fail"|"na"|"recommend","note?":"...","laborHours?":number|null,"parts?":[{"description":"...","qty":number}]}
- pause_inspection: {"command":"pause_inspection"}
- finish_inspection: {"command":"finish_inspection"}
- complete_item: {"command":"complete_item","section?":"...","item?":"..."}
- skip_item:     {"command":"skip_item","section?":"...","item?":"..."}

Examples:
"brake fluid level okay" =>
[{"command":"update_status","item":"Brake fluid level/condition","status":"ok"}]

"left front tread depth 8mm" =>
[{"command":"update_value","item":"Tread depth (Left front)","value":8,"unit":"mm"}]

"mark brake section okay" =>
[{"command":"section_status","section":"Brakes","status":"ok"}]
`.trim();

    const strictContextRules = hasContext
      ? `
CONTEXT:
- The UI provides a list of allowed inspection item labels (exact strings).
- If you reference an item, you MUST choose item from the allowed list.
- If the transcript does not clearly match any allowed item, return [].
- For "oneshot_item", the "item" field MUST match an allowed item.
- For "section_status", choose a section name that closely matches the user's words.

Allowed items:
${allowedItems.map((x) => `- ${x}`).join("\n")}

Optional section hint (may be empty): ${norm(ctx?.sectionTitle ?? "")}
`.trim()
      : "";

    const systemPrompt = [systemPromptBase, strictContextRules]
      .filter(Boolean)
      .join("\n\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: transcript },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "[]";
    let commands = safeJsonParseArray(raw).map(normalizeNoteFields);

    // strict_context: map unknown items -> best allowed match (or drop)
    if (mode === "strict_context" && hasContext) {
      const allowed = allowedItems;

      const filtered: VoiceCommand[] = [];
      for (const cmd of commands) {
        if ("item" in cmd) {
          const itemVal = cmd.item;
          if (!itemVal) {
            filtered.push(cmd);
            continue;
          }

          const best = findBestAllowedItem(allowed, String(itemVal));
          if (!best) continue;

          filtered.push(withExactItem(cmd, best));
          continue;
        }

        filtered.push(cmd);
      }

      commands = filtered;
    }

    return NextResponse.json(commands);
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.error("[api/ai/interpret] error:", err);
    return NextResponse.json([]);
  }
}