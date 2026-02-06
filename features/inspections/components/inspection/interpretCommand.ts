// /features/inspections/lib/inspection/interpretCommand.ts (FULL FILE REPLACEMENT)
// ✅ NO MANUAL FOCUS:
// - This file does NOT assume “current section” or “current item”.
// - If you pass ctx.items, it should be the GLOBAL item list (all sections) so voice can target anything anytime.
// - sectionTitle/sectionTitles are OPTIONAL hints only (never used to “focus”/restrict on the client).

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
    sectionTitle && !sectionTitles.some((t) => t.toLowerCase() === sectionTitle.toLowerCase())
      ? [sectionTitle, ...sectionTitles]
      : sectionTitles;

  return {
    sectionTitle,
    sectionTitles: mergedSectionTitles,
    items,
  };
}

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