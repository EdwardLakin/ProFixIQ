"use client";

import type {
  ParsedCommand,
  ParsedInspectionFindingCommand,
} from "@inspections/lib/inspection/types";

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
  if (Array.isArray(data)) return data;

  if (isRecord(data)) {
    const cmds = data.commands;
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

function extractFirstNumber(raw: string): { value: number; match: string } | null {
  const m = raw.match(/-?\d+(?:\.\d+)?/);
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
  if (/\b(fail|failed|bad|not ok|not okay|leak|leaking|broken)\b/.test(t)) {
    return "fail";
  }
  if (/\b(n\/a|na|not applicable|not app|doesn t apply|does not apply)\b/.test(t)) {
    return "na";
  }
  if (/\b(rec|recommend|recommended|suggest)\b/.test(t)) {
    return "recommend";
  }
  return null;
}

function stripStatusWords(raw: string): string {
  return raw
    .replace(
      /\b(ok|okay|pass|passed|good|fine|fail|failed|na|n\/a|not applicable|rec|recommend|recommended)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function stripNumberAndUnitWords(raw: string): string {
  return raw
    .replace(/-?\d+(?:\.\d+)?/g, " ")
    .replace(
      /\b(mm|millimet(er|re)s?|psi|kpa|inch|inches|\bin\b|ft\s*lb|ftlb|ft-lb|cca|volts?\b|\bv\b|mil|mils)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function scoreItemLabel(label: string, hint: string): number {
  const lt = tokens(label);
  const ht = tokens(hint);
  if (lt.length === 0 || ht.length === 0) return 0;

  const labelSet = new Set(lt);
  let score = 0;
  const labelNorm = norm(label);
  const hintNorm = norm(hint);

  for (const tok of ht) {
    if (tok === "lf" || tok === "rf" || tok === "lr" || tok === "rr") {
      if (labelSet.has(tok) || labelNorm.includes(tok)) score += 90;
      continue;
    }
    if (tok === "steer" || tok === "drive" || tok === "tag" || tok === "trailer") {
      if (labelNorm.includes(tok)) score += 45;
      continue;
    }
    if (tok === "left" || tok === "right" || tok === "front" || tok === "rear") {
      if (labelSet.has(tok) || labelNorm.includes(tok)) score += 22;
      continue;
    }
    if (
      tok === "tread" ||
      tok === "pressure" ||
      tok === "pad" ||
      tok === "lining" ||
      tok === "shoe" ||
      tok === "rod" ||
      tok === "tie"
    ) {
      if (labelNorm.includes(tok)) score += 22;
      continue;
    }
    if (tok.length >= 3 && labelNorm.includes(tok)) score += 4;
  }

  if (
    hintNorm.includes("tread") &&
    hintNorm.includes("depth") &&
    labelNorm.includes("tread") &&
    labelNorm.includes("depth")
  ) {
    score += 20;
  }
  if (hintNorm.includes("tie rod") && labelNorm.includes("tie rod")) score += 30;
  if (hintNorm.includes("brake chamber") && labelNorm.includes("brake chamber")) score += 30;

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

function extractLaborHours(raw: string): number | null {
  const t = norm(raw);
  const m =
    t.match(/\b(\d+(?:\.\d+)?)\s*(?:hr|hrs|hour|hours)\b/) ??
    t.match(/\b(\d+(?:\.\d+)?)\s*h\b/);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function extractParts(raw: string): Array<{ description: string; qty: number }> {
  const text = raw.trim();

  const patterns = [
    /\badd\s+(.+?)\s+to\s+request\b/i,
    /\badd\s+(.+?)\s+to\s+quote\b/i,
    /\brequest\s+(.+?)\b/i,
    /\bneeds?\s+(.+?)\b/i,
    /\breplace\s+(.+?)\b/i,
    /\bwith\s+(.+?)\b/i,
  ];

  let partChunk = "";
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      partChunk = m[1].trim();
      break;
    }
  }

  if (!partChunk) return [];

  const pieces = partChunk
    .split(/,| and /i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return pieces.map((description) => {
    const qtyMatch = description.match(/^(\d+)\s+(.+)$/);
    if (qtyMatch?.[1] && qtyMatch?.[2]) {
      return {
        qty: Number(qtyMatch[1]),
        description: qtyMatch[2].trim(),
      };
    }
    return { qty: 1, description };
  });
}

function extractNote(
  raw: string,
  resolvedItem: string | null,
  status: LocalStatus | null,
): string | undefined {
  if (!status || (status !== "fail" && status !== "recommend")) return undefined;

  let t = raw.trim();

  if (resolvedItem) {
    const escaped = resolvedItem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped, "i");
    t = t.replace(re, " ").trim();
  }

  t = t
    .replace(
      /\b(ok|okay|pass|passed|good|fine|fail|failed|na|n\/a|not applicable|rec|recommend|recommended)\b/gi,
      " ",
    )
    .replace(/\badd\b.+$/i, " ")
    .replace(/\b\d+(?:\.\d+)?\s*(?:hr|hrs|hour|hours|h)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return t.length > 1 ? t : undefined;
}

function localParseInspectionFinding(
  raw: string,
  context: { items: string[] } | null,
): ParsedInspectionFindingCommand[] {
  if (!context) return [];

  const text = normalizeString(raw);
  if (!text) return [];

  const status = detectStatus(text);
  if (!status) return [];

  const laborHours = extractLaborHours(text);
  const parts = extractParts(text);

  const itemHint = stripNumberAndUnitWords(stripStatusWords(text))
    .replace(/\badd\b.+$/i, " ")
    .replace(/\s+/g, " ")
    .trim();

  const best = resolveBestItem(context.items, itemHint || text);
  if (!best) return [];

  const note = extractNote(text, best.item, status);

  return [
    {
      type: "inspection_finding",
      item: best.item,
      status,
      note,
      parts: parts.length > 0 ? parts : undefined,
      laborHours,
      openPhotoCapture: status === "fail" || status === "recommend",
    },
  ];
}

type LocalParse =
  | { kind: "status"; status: LocalStatus; itemHint: string }
  | { kind: "measurement"; value: number; unit?: string; itemHint: string };

function localParseUtterance(raw: string): LocalParse | null {
  const text = normalizeString(raw);
  if (!text) return null;

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

function buildParsedFromLocal(
  parsed: LocalParse,
  context: { items: string[] } | null,
): ParsedCommand[] {
  if (!context) return [];

  const best = resolveBestItem(context.items, parsed.itemHint);
  if (!best) return [];

  if (parsed.kind === "status") {
    return [
      {
        type: "status",
        section: "",
        item: best.item,
        status: parsed.status,
      },
    ];
  }

  return [
    {
      type: "measurement",
      section: "",
      item: best.item,
      value: parsed.value,
      unit: parsed.unit,
    },
  ];
}

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

    const findingCmds = localParseInspectionFinding(
      p,
      context ? { items: context.items } : null,
    );
    if (findingCmds.length > 0) return findingCmds;

    const lp = localParseUtterance(p);
    if (lp && context) {
      const localCmds = buildParsedFromLocal(lp, {
        items: context.items,
      });
      if (localCmds.length > 0) return localCmds;
    }

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
        console.error("[interpretCommand] non-OK response", res.status, { p });
        return [];
      }

      const data = (await res.json()) as InterpretResponse;
      return pickCommandsFromResponse(data);
    } catch (err) {
      console.error("[interpretCommand] failed", err);
      return [];
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
