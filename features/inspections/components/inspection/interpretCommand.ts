"use client";

import type { ParsedCommand } from "@inspections/lib/inspection/types";

export type InterpretContext = {
  sectionTitles?: string[];
  sectionTitle?: string;
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

function splitMultiCommands(input: string): string[] {
  const t = normalizeString(input);
  if (!t) return [];

  const normalized = t
    .replace(/\bthen\b/gi, " and ")
    .replace(/\balso\b/gi, " and ")
    .replace(/[;]+/g, " and ")
    .replace(/(?<!\d)\.(?!\d)/g, " and ")
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

  const sectionTitles = dedupeStringsKeepOrder(
    safeArray<string>(ctx.sectionTitles),
  );
  const sectionTitle = normalizeString(ctx.sectionTitle ?? "");

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
  const m = raw.match(/-?(?:\d+(?:\.\d+)?|\.\d+)/);
  if (!m) return null;
  const n = Number(m[0]);
  if (!Number.isFinite(n)) return null;
  return { value: n, match: m[0] };
}

function inferUnit(raw: string): string | undefined {
  const t = norm(raw);

  if (/\bpsi\b/.test(t)) return "psi";
  if (/\bkpa\b/.test(t)) return "kPa";
  if (/\bmm\b|\bmillimet(er|re)s?\b/.test(t)) return "mm";
  if (/\b(inch|inches|\bin\b)\b/.test(t)) return "in";
  if (/\b(ft\s*lb|ftlb|ft-lb|foot\s*pounds?)\b/.test(t)) return "ft·lb";
  if (/\bcca\b/.test(t)) return "CCA";
  if (/\bvolts?\b|\bv\b/.test(t)) return "V";
  if (/\bmil|mils\b/.test(t)) return "mm";

  return undefined;
}

function detectStatus(raw: string): LocalStatus | null {
  const t = norm(raw);

  if (/\b(ok|okay|okey|pass|passed|good|looks good|all good|fine)\b/.test(t)) {
    return "ok";
  }

  if (/\b(fail|failed|fails|bad|not ok|not okay|leak|leaking|broken)\b/.test(t)) {
    return "fail";
  }

  if (/\b(n\/a|na|not applicable|not app|doesn t apply|does not apply)\b/.test(t)) {
    return "na";
  }

  if (/\b(rec|recommend|recommended|suggest)\b/.test(t)) return "recommend";

  return null;
}

function stripStatusWords(raw: string): string {
  return raw
    .replace(
      /\b(ok|okay|pass|passed|good|fine|fail|failed|fails|na|n\/a|not applicable|rec|recommend|recommended)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function stripNumberAndUnitWords(raw: string): string {
  return raw
    .replace(/-?(?:\d+(?:\.\d+)?|\.\d+)/g, " ")
    .replace(
      /\b(mm|millimet(er|re)s?|psi|kpa|inch|inches|\bin\b|ft\s*lb|ftlb|ft-lb|cca|volts?\b|\bv\b|mil|mils)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function localParseUtterance(raw: string): LocalParse | null {
  const text = normalizeString(raw);
  if (!text) return null;

  // "add .5 labor" is a labor line, never a measurement reading.
  if (/\blabou?r\b/i.test(text)) return null;

  const t = norm(text);

  const secMatch = t.match(
    /\b(.+?)\s+(section|sections)\s+(ok|okay|pass|fail|failed|fails|na|n\/a|recommend|rec)\b/,
  );
  if (secMatch) {
    const sectionHint = String(secMatch[1] ?? "").trim();
    const st = detectStatus(secMatch[0] ?? "");
    if (sectionHint && st) {
      return { kind: "section_status", sectionHint, status: st };
    }
  }

  const num = extractFirstNumber(text);
  const unit = inferUnit(text);

  if (num) {
    const itemHint = stripNumberAndUnitWords(text);
    if (itemHint.length >= 2) {
      return { kind: "measurement", value: num.value, unit, itemHint };
    }
  }

  const st = detectStatus(text);
  if (st) {
    const itemHint = stripStatusWords(text);
    if (itemHint.length >= 2) {
      return { kind: "status", status: st, itemHint };
    }
  }

  return null;
}

type Corner = "lf" | "rf" | "lr" | "rr";

/**
 * Which tire corner a phrase names, whether spoken ("right front", "front
 * left") or as a hydraulic grid label code ("RF Tread Depth"). Without this,
 * "right front tread depth" shares no token with "RF Tread Depth" beyond
 * "tread depth", so every corner scored the same and the first one (left
 * front) always won.
 */
function cornerOf(text: string): Corner | null {
  const t = norm(text);
  if (/\blf\b|\b(left\s+front|front\s+left)\b/.test(t)) return "lf";
  if (/\brf\b|\b(right\s+front|front\s+right)\b/.test(t)) return "rf";
  if (/\blr\b|\b(left\s+rear|rear\s+left)\b/.test(t)) return "lr";
  if (/\brr\b|\b(right\s+rear|rear\s+right)\b/.test(t)) return "rr";
  return null;
}

function innerOuterOf(text: string): "inner" | "outer" | null {
  const t = norm(text);
  if (/\binner\b/.test(t)) return "inner";
  if (/\bouter\b/.test(t)) return "outer";
  return null;
}

function scoreItemLabel(label: string, hint: string): number {
  const lt = tokens(label);
  const ht = tokens(hint);
  if (lt.length === 0 || ht.length === 0) return 0;

  const labelSet = new Set(lt);
  let score = 0;

  // A named corner must match the label's corner; a different corner is
  // never a candidate, however well the rest of the words line up.
  const hintCorner = cornerOf(hint);
  const labelCorner = cornerOf(label);
  if (hintCorner && labelCorner && hintCorner !== labelCorner) return 0;

  const hintSide = innerOuterOf(hint);
  const labelSide = innerOuterOf(label);
  if (hintSide && labelSide && hintSide !== labelSide) return 0;

  // Score contributed by words that say *what* is being measured (tread,
  // pressure, shock...), as opposed to *where* (left/front/steer/corner
  // codes). A corner only disambiguates between items that already match on
  // substance: "right rear shock leaking" must not land on "RR Tire
  // Pressure" just because both name the right rear.
  let semantic = 0;

  for (const tok of ht) {
    if (tok === "lf" || tok === "rf" || tok === "lr" || tok === "rr") {
      if (labelSet.has(tok) || norm(label).includes(tok)) score += 90;
      continue;
    }

    if (
      tok === "steer" ||
      tok === "drive" ||
      tok === "tag" ||
      tok === "trailer"
    ) {
      if (norm(label).includes(tok)) score += 45;
      continue;
    }

    if (
      tok === "left" ||
      tok === "right" ||
      tok === "front" ||
      tok === "rear"
    ) {
      if (labelSet.has(tok) || norm(label).includes(tok)) score += 22;
      continue;
    }

    if (
      tok === "tread" ||
      tok === "pressure" ||
      tok === "pad" ||
      tok === "lining" ||
      tok === "shoe" ||
      tok === "slack" ||
      tok === "adjuster" ||
      tok === "chamber" ||
      tok === "tank" ||
      tok === "hose" ||
      tok === "line"
    ) {
      if (norm(label).includes(tok)) {
        score += 22;
        semantic += 22;
      }
      continue;
    }

    if (tok.length >= 3 && norm(label).includes(tok)) {
      score += 4;
      semantic += 4;
    }
  }

  const h = norm(hint);
  const l = norm(label);
  if (h.includes("tread") && h.includes("depth") && l.includes("tread") && l.includes("depth")) {
    score += 20;
    semantic += 20;
  }
  if (h.includes("slack") && h.includes("adjuster") && l.includes("slack") && l.includes("adjuster")) {
    score += 30;
    semantic += 30;
  }
  if (h.includes("brake chamber") && l.includes("chamber")) {
    score += 28;
    semantic += 28;
  }

  if (hintCorner && semantic === 0) return 0;
  if (hintCorner && labelCorner) score += 90;
  if (hintSide && labelSide) score += 30;


  return score;
}

function resolveBestItem(items: string[], hint: string): { item: string; score: number } | null {
  let best: { item: string; score: number } | null = null;

  for (const it of items) {
    const s = scoreItemLabel(it, hint);
    if (s <= 0) continue;
    if (!best || s > best.score) best = { item: it, score: s };
  }

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

  const cmd = {
    type: "measurement",
    item: best.item,
    value: parsed.value,
    unit: parsed.unit,
  } as unknown as ParsedCommand;

  return [cmd];
}

const INTERPRET_TIMEOUT_MS = 15_000;

/** Why the interpreter returned nothing, in words a technician can act on. */
function interpretFailureReason(status: number): string {
  if (status === 429) return "Voice AI is rate limited — try again in a moment.";
  if (status === 401 || status === 403) return "Voice AI is not available for this login.";
  if (status === 503) return "Voice AI is temporarily unavailable.";
  if (status === 504) return "Voice AI took too long.";
  return "Voice AI could not process that.";
}

export async function interpretCommand(
  transcript: string,
  ctx?: InterpretContext,
  onFailure?: (reason: string) => void,
): Promise<ParsedCommand[]> {
  const text = normalizeString(transcript);
  if (!text) return [];

  const context = buildContext(ctx);
  const parts = splitMultiCommands(text);

  const interpretOne = async (part: string): Promise<ParsedCommand[]> => {
    const p = normalizeString(part);
    if (!p) return [];

    const lp = localParseUtterance(p);
    if (lp && context) {
      const localCmds = buildParsedFromLocal(lp, {
        sectionTitles: context.sectionTitles,
        items: context.items,
      });
      if (localCmds.length > 0) return localCmds;
    }

    // A hung request would otherwise leave the technician waiting forever
    // with no feedback, so bound it and report why nothing happened.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), INTERPRET_TIMEOUT_MS);
    try {
      const res = await fetch("/api/ai/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          transcript: p,
          context,
          mode: context ? "strict_context" : "open",
        }),
      });

      if (!res.ok) {
        console.error("[interpretCommand] non-OK response", res.status, { p });
        onFailure?.(interpretFailureReason(res.status));
        return [];
      }

      const data = (await res.json()) as InterpretResponse;
      return pickCommandsFromResponse(data);
    } catch (err) {
      console.error("[interpretCommand] failed", err);
      onFailure?.(
        err instanceof DOMException && err.name === "AbortError"
          ? "Voice AI took too long."
          : "Voice AI could not be reached — check your connection.",
      );
      return [];
    } finally {
      clearTimeout(timer);
    }
  };

  if (parts.length <= 1) {
    return interpretOne(text);
  }

  const results: ParsedCommand[][] = [];
  for (const p of parts) {
    const cmds = await interpretOne(p);
    results.push(cmds);
  }

  return mergeParsedCommands(results);
}
