// /features/inspections/lib/inspection/interpretCommand.ts (FULL FILE REPLACEMENT)
// ✅ NO MANUAL FOCUS:
// - This file does NOT assume “current section” or “current item”.
// - If you pass ctx.items, it should be the GLOBAL item list (all sections) so voice can target anything anytime.
// - sectionTitle/sectionTitles are OPTIONAL hints only (never used to “focus”/restrict on the client).
//
// ✅ FIX: Local fallback parser (no server needed) for "plain talk" commands:
// - "brake fluid level okay" => status OK on best-matching item
// - "left front tread depth 8mm" => measurement on best-matching item
// - still uses /api/ai/interpret when local parse can't confidently resolve
//
// No `any`.

"use client";

import type { ParsedCommand } from "@inspections/lib/inspection/types";

export type InterpretContext = {
  /**
   * OPTIONAL hint(s) only — not used for client-side focusing.
   * You can pass all section titles here so the server/model can resolve
   * commands like “mark tire section ok”.
   */
  sectionTitles?: string[];

  /**
   * OPTIONAL single title hint (backwards compatible).
   * Treat as hint only — do not pass “current section” unless you truly want to hint.
   */
  sectionTitle?: string;

  /**
   * Candidate item labels — for a hands-free system this MUST be the GLOBAL list:
   * all items across all sections (template-derived), not just the current section.
   */
  items: string[];
};

type InterpretResponse =
  | ParsedCommand[]
  | {
      commands?: ParsedCommand[];
      [k: string]: unknown;
    };

function safeArray<T>(x: unknown): T[] {
  return Array.isArray(x) ? (x as T[]) : [];
}

function normalizeString(s: unknown): string {
  return String(s ?? "").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Better multi-command splitting:
 * - preserves decimals (2.5)
 * - handles "then", "also", semicolons
 * - treats a period as a separator only if NOT between digits
 */
function splitMultiCommands(input: string): string[] {
  const t = normalizeString(input);
  if (!t) return [];

  const normalized = t
    .replace(/\bthen\b/gi, " and ")
    .replace(/\balso\b/gi, " and ")
    .replace(/[;]+/g, " and ")
    .replace(/(?<!\d)\.(?!\d)/g, " and ") // period not between digits
    .replace(/\s+/g, " ")
    .trim();

  const parts = normalized
    .split(/\s+\band\b\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : [t];
}

function mergeParsedCommands(chunks: ParsedCommand[][]): ParsedCommand[] {
  const out: ParsedCommand[] = [];
  for (const arr of chunks) {
    for (const cmd of arr) out.push(cmd);
  }
  return out;
}

function pickCommandsFromResponse(data: InterpretResponse): ParsedCommand[] {
  if (Array.isArray(data)) return data as ParsedCommand[];

  if (isRecord(data)) {
    const cmds = (data as { commands?: unknown }).commands;
    if (Array.isArray(cmds)) return cmds as ParsedCommand[];
  }

  return [];
}

function dedupeStringsKeepOrder(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of list) {
    const v = normalizeString(s);
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

function buildContext(ctx?: InterpretContext): {
  sectionTitle: string;
  sectionTitles: string[];
  items: string[];
} | null {
  if (!ctx) return null;

  const items = dedupeStringsKeepOrder(safeArray<string>(ctx.items));
  if (items.length === 0) return null;

  const sectionTitles = dedupeStringsKeepOrder(safeArray<string>(ctx.sectionTitles));
  const sectionTitle = normalizeString(ctx.sectionTitle ?? "");

  // If caller only provides sectionTitle (legacy), include it into sectionTitles too.
  const mergedSectionTitles =
    sectionTitle &&
    !sectionTitles.some((t) => t.toLowerCase() === sectionTitle.toLowerCase())
      ? [sectionTitle, ...sectionTitles]
      : sectionTitles;

  return {
    sectionTitle,
    sectionTitles: mergedSectionTitles,
    items,
  };
}

/* -------------------------------------------------------------------------------------------------
 * Local fallback parser (handles "plain talk" without /api/ai/interpret)
 * ------------------------------------------------------------------------------------------------- */

function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^\w\s.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  const t = norm(s);
  if (!t) return [];
  return t.split(" ").filter((w) => w.length >= 2);
}

type LocalStatus = "ok" | "fail" | "na" | "recommend";
type LocalParse =
  | { kind: "status"; status: LocalStatus; itemHint: string }
  | { kind: "measurement"; value: number; unit?: string; itemHint: string }
  | { kind: "section_status"; status: LocalStatus; sectionHint: string };

function extractFirstNumber(raw: string): { value: number; match: string } | null {
  const m = raw.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  if (!Number.isFinite(n)) return null;
  return { value: n, match: m[0] };
}

function inferUnit(raw: string): string | undefined {
  const t = norm(raw);

  // common units
  if (/\bpsi\b/.test(t)) return "psi";
  if (/\bkpa\b/.test(t)) return "kPa";
  if (/\bmm\b|\bmillimet(er|re)s?\b/.test(t)) return "mm";
  if (/\b(inch|inches|\bin\b)\b/.test(t)) return "in";
  if (/\b(ft\s*lb|ftlb|ft-lb|foot\s*pounds?)\b/.test(t)) return "ft·lb";
  if (/\bcca\b/.test(t)) return "CCA";
  if (/\bvolts?\b|\bv\b/.test(t)) return "V";

  // tech says "mil/mils" a lot — treat as mm for your grids
  if (/\bmil|mils\b/.test(t)) return "mm";

  return undefined;
}

function detectStatus(raw: string): LocalStatus | null {
  const t = norm(raw);

  // OK
  if (/\b(ok|okay|okey|pass|passed|good|looks good|all good|fine)\b/.test(t))
    return "ok";

  // FAIL
  if (/\b(fail|failed|bad|not ok|not okay|leak|leaking|broken)\b/.test(t))
    return "fail";

  // NA
  if (/\b(n\/a|na|not applicable|not app|doesn t apply|does not apply)\b/.test(t))
    return "na";

  // RECOMMEND
  if (/\b(rec|recommend|recommended|suggest)\b/.test(t)) return "recommend";

  return null;
}

function stripStatusWords(raw: string): string {
  return raw
    .replace(/\b(ok|okay|pass|passed|good|fine|fail|failed|na|n\/a|not applicable|rec|recommend|recommended)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripNumberAndUnitWords(raw: string): string {
  return raw
    .replace(/-?\d+(?:\.\d+)?/g, " ")
    .replace(/\b(mm|millimet(er|re)s?|psi|kpa|inch|inches|\bin\b|ft\s*lb|ftlb|ft-lb|cca|volts?\b|\bv\b|mil|mils)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function localParseUtterance(raw: string): LocalParse | null {
  const text = normalizeString(raw);
  if (!text) return null;

  const t = norm(text);

  // SECTION status phrasing
  // e.g. "mark brake section ok", "brake section ok", "tires section na"
  const secMatch = t.match(/\b(.+?)\s+(section|sections)\s+(ok|okay|pass|fail|failed|na|n\/a|recommend|rec)\b/);
  if (secMatch) {
    const sectionHint = String(secMatch[1] ?? "").trim();
    const st = detectStatus(secMatch[0] ?? "");
    if (sectionHint && st) return { kind: "section_status", sectionHint, status: st };
  }

  // Measurement: any number present + likely measurement words OR unit present
  const num = extractFirstNumber(text);
  const unit = inferUnit(text);

  // If there's a number, assume measurement intent (this matches your desired "left front tread depth 8mm")
  if (num) {
    const itemHint = stripNumberAndUnitWords(text);
    if (itemHint.length >= 2) {
      return { kind: "measurement", value: num.value, unit, itemHint };
    }
  }

  // Status: any status word present
  const st = detectStatus(text);
  if (st) {
    const itemHint = stripStatusWords(text);
    if (itemHint.length >= 2) {
      return { kind: "status", status: st, itemHint };
    }
  }

  return null;
}

function scoreItemLabel(label: string, hint: string): number {
  const lt = tokens(label);
  const ht = tokens(hint);
  if (lt.length === 0 || ht.length === 0) return 0;

  const labelSet = new Set(lt);

  let score = 0;
  for (const tok of ht) {
    // strong corner tokens
    if (tok === "lf" || tok === "rf" || tok === "lr" || tok === "rr") {
      if (labelSet.has(tok) || norm(label).includes(tok)) score += 90;
      continue;
    }

    // axle-ish tokens
    if (tok === "steer" || tok === "drive" || tok === "tag" || tok === "trailer") {
      if (norm(label).includes(tok)) score += 45;
      continue;
    }

    // side tokens
    if (tok === "left" || tok === "right" || tok === "front" || tok === "rear") {
      if (labelSet.has(tok) || norm(label).includes(tok)) score += 22;
      continue;
    }

    // key metric tokens
    if (tok === "tread" || tok === "pressure" || tok === "pad" || tok === "lining" || tok === "shoe") {
      if (norm(label).includes(tok)) score += 22;
      continue;
    }

    if (tok.length >= 3 && norm(label).includes(tok)) score += 4;
  }

  // bonus: if hint says tread depth, prioritize labels containing both tread + depth
  const h = norm(hint);
  const l = norm(label);
  if (h.includes("tread") && h.includes("depth") && l.includes("tread") && l.includes("depth")) score += 20;

  return score;
}

function resolveBestItem(items: string[], hint: string): { item: string; score: number } | null {
  let best: { item: string; score: number } | null = null;

  for (const it of items) {
    const s = scoreItemLabel(it, hint);
    if (s <= 0) continue;
    if (!best || s > best.score) best = { item: it, score: s };
  }

  // Confidence floor to avoid random writes
  if (!best || best.score < 24) return null;
  return best;
}

function resolveBestSection(sectionTitles: string[], hint: string): string | null {
  const h = norm(hint);
  if (!h) return null;

  let best: { title: string; score: number } | null = null;

  for (const title of sectionTitles) {
    const t = norm(title);
    if (!t) continue;

    // simple token overlap
    const tt = new Set(tokens(t));
    let score = 0;
    for (const tok of tokens(h)) {
      if (tok.length >= 3 && tt.has(tok)) score += 6;
    }

    if (t.includes("brake") && h.includes("brake")) score += 10;
    if (t.includes("tire") && h.includes("tire")) score += 10;
    if (t.includes("battery") && h.includes("battery")) score += 10;
    if (t.includes("air") && h.includes("air")) score += 8;

    if (score > 0 && (!best || score > best.score)) best = { title, score };
  }

  if (!best || best.score < 10) return null;
  return best.title;
}

function buildParsedFromLocal(
  parsed: LocalParse,
  context: { sectionTitles: string[]; items: string[] } | null,
): ParsedCommand[] {
  if (!context) return [];

  if (parsed.kind === "section_status") {
    const section = resolveBestSection(context.sectionTitles, parsed.sectionHint);
    if (!section) return [];

    // Name-based command shape expected by handleTranscriptFn:
    // { type: "section_status", section: "...", status: "ok" }
    const cmd = {
      type: "section_status",
      section,
      status: parsed.status,
    } as unknown as ParsedCommand;

    return [cmd];
  }

  const best = resolveBestItem(context.items, parsed.itemHint);
  if (!best) return [];

  if (parsed.kind === "status") {
    const cmd = {
      type: "status",
      item: best.item,
      status: parsed.status,
    } as unknown as ParsedCommand;
    return [cmd];
  }

  // measurement
  const cmd = {
    type: "measurement",
    item: best.item,
    value: parsed.value,
    unit: parsed.unit,
  } as unknown as ParsedCommand;

  return [cmd];
}

/* -------------------------------------------------------------------------------------------------
 * Main
 * ------------------------------------------------------------------------------------------------- */

/**
 * Interpret a voice command into ParsedCommand[].
 * ✅ Supports multi-command utterances by splitting the transcript.
 * ✅ NO MANUAL FOCUS: this function never “locks” to the current section/item.
 *
 * IMPORTANT:
 * - If you pass ctx.items, make it GLOBAL (all items across all sections) to keep it hands-free.
 * - We still send `mode: "strict_context"` when items exist so the server can constrain *to the global template*,
 *   which improves accuracy without “focusing” on any one item.
 */
export async function interpretCommand(
  transcript: string,
  ctx?: InterpretContext,
): Promise<ParsedCommand[]> {
  const text = normalizeString(transcript);
  if (!text) return [];

  const context = buildContext(ctx);
  const parts = splitMultiCommands(text);

  const interpretOne = async (part: string): Promise<ParsedCommand[]> => {
    const p = normalizeString(part);
    if (!p) return [];

    // ✅ 1) Local fallback first (handles "brake fluid level okay", "left front tread depth 8mm")
    const lp = localParseUtterance(p);
    if (lp && context) {
      const localCmds = buildParsedFromLocal(lp, {
        sectionTitles: context.sectionTitles,
        items: context.items,
      });
      if (localCmds.length > 0) return localCmds;
    }

    // ✅ 2) Server interpret as fallback
    try {
      const res = await fetch("/api/ai/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: p,
          context,
          mode: context ? "strict_context" : "open",
        }),
      });

      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.error("[interpretCommand] non-OK response", res.status, { p });
        return [];
      }

      const data = (await res.json()) as InterpretResponse;
      return pickCommandsFromResponse(data);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[interpretCommand] failed", err);
      return [];
    }
  };

  if (parts.length <= 1) {
    return interpretOne(text);
  }

  const results: ParsedCommand[][] = [];
  for (const p of parts) {
    // eslint-disable-next-line no-await-in-loop
    const cmds = await interpretOne(p);
    results.push(cmds);
  }

  return mergeParsedCommands(results);
}