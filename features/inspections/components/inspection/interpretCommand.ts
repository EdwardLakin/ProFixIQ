// /features/inspections/lib/inspection/interpretCommand.ts (FULL FILE REPLACEMENT)
"use client";

import type { ParsedCommand } from "@inspections/lib/inspection/types";

export type InterpretContext = {
  /**
   * OPTIONAL: section title currently in view
   * (you can also pass "" and just send items)
   */
  sectionTitle?: string;

  /**
   * Candidate item labels (ideally FROM THE CURRENT INSPECTION TEMPLATE).
   * When provided, we force STRICT_CONTEXT mode and the server should pick
   * ONLY from these items (or return indices).
   */
  items: string[];
};

type InterpretResponse =
  | ParsedCommand[]
  | {
      commands?: ParsedCommand[];
      // allow unknown fields without breaking
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
 * - supports quick sequences like "ok. next" => 2 commands
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

function buildContext(ctx?: InterpretContext): {
  sectionTitle: string;
  items: string[];
} | null {
  if (!ctx) return null;

  const items = safeArray<string>(ctx.items)
    .map((s) => normalizeString(s))
    .filter(Boolean);

  // Deduplicate while preserving order
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const it of items) {
    const k = it.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(it);
  }

  if (deduped.length === 0) return null;

  return {
    sectionTitle: normalizeString(ctx.sectionTitle ?? ""),
    items: deduped,
  };
}

/**
 * Interpret a voice command into ParsedCommand[].
 * ✅ Supports multi-command utterances by splitting the transcript.
 * ✅ Forces strict_context when ctx.items is provided (this is key for tire/battery grids).
 * ✅ Adds light client-side normalization to improve hit rate for "rated" vs "rating" etc.
 */
export async function interpretCommand(
  transcript: string,
  ctx?: InterpretContext,
): Promise<ParsedCommand[]> {
  const raw = normalizeString(transcript);
  if (!raw) return [];

  const context = buildContext(ctx);

  // Small normalization to reduce common transcript variance
  // (don’t overdo it; keep meaning intact)
  const text = raw
    .replace(/\brating\b/gi, "rated") // "battery rating" => "battery rated"
    .replace(/\btest\b/gi, "tested"); // "battery test" => "battery tested"

  const parts = splitMultiCommands(text);

  const interpretOne = async (part: string): Promise<ParsedCommand[]> => {
    const p = normalizeString(part);
    if (!p) return [];

    try {
      // IMPORTANT: this must match your actual route file
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

  // If it’s a single command, do one request.
  if (parts.length <= 1) {
    return interpretOne(text);
  }

  // Multi-command: interpret each fragment and merge.
  const results: ParsedCommand[][] = [];
  for (const p of parts) {
    // eslint-disable-next-line no-await-in-loop
    const cmds = await interpretOne(p);
    results.push(cmds);
  }

  return mergeParsedCommands(results);
}