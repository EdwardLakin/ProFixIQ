// /features/inspections/lib/inspection/interpretCommand.ts
"use client";

import type { ParsedCommand } from "@inspections/lib/inspection/types";

export type InterpretContext = {
  /**
   * OPTIONAL: section title currently in view
   * (you can also pass "" and just send items)
   */
  sectionTitle?: string;
  /**
   * Candidate item labels (ideally FROM THE CURRENT INSPECTION TEMPLATE)
   * The server will require the model to pick an item from this list.
   */
  items: string[];
};

type InterpretResponse = unknown;

function safeArray<T>(x: unknown): T[] {
  return Array.isArray(x) ? (x as T[]) : [];
}

function normalizeString(s: unknown): string {
  return String(s ?? "").trim();
}

function splitMultiCommands(input: string): string[] {
  const t = normalizeString(input);
  if (!t) return [];

  const normalized = t
    .replace(/\bthen\b/gi, " and ")
    .replace(/\balso\b/gi, " and ")
    .replace(/[;]+/g, " and ")
    // ✅ only treat periods as separators when they are not decimals
    // period that is NOT between digits:
    .replace(/(?<!\d)\.(?!\d)/g, " and ")
    .replace(/\s+/g, " ")
    .trim();

  const parts = normalized
    .split(/\s+\band\b\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : [t];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function mergeParsedCommands(chunks: ParsedCommand[][]): ParsedCommand[] {
  const out: ParsedCommand[] = [];
  for (const arr of chunks) {
    for (const cmd of arr) out.push(cmd);
  }
  return out;
}

/**
 * Interpret a voice command into ParsedCommand[].
 * ✅ Now supports multi-command utterances by splitting the transcript and
 * calling the interpret endpoint per fragment (no server changes required).
 */
export async function interpretCommand(
  transcript: string,
  ctx?: InterpretContext,
): Promise<ParsedCommand[]> {
  const text = normalizeString(transcript);
  if (!text) return [];

  const context =
    ctx && safeArray<string>(ctx.items).length > 0
      ? {
          sectionTitle: normalizeString(ctx.sectionTitle ?? ""),
          items: safeArray<string>(ctx.items)
            .map((s) => normalizeString(s))
            .filter(Boolean),
        }
      : null;

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

      // Support both:
      // - array response: ParsedCommand[]
      // - object with { commands: ParsedCommand[] }
      if (Array.isArray(data)) return data as ParsedCommand[];

      if (isRecord(data) && Array.isArray(data.commands)) {
        return data.commands as ParsedCommand[];
      }

      return [];
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