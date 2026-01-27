// features/inspections/components/inspection/interpretCommand.ts
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

/**
 * Interpret a voice command into ParsedCommand[].
 * Supports optional context so the model can reliably match section/items.
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

  try {
    // IMPORTANT: this must match your actual route file
    const res = await fetch("/api/ai/interpret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: text,
        context,
        mode: context ? "strict_context" : "open",
      }),
    });

    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.error("[interpretCommand] non-OK response", res.status);
      return [];
    }

    const data = (await res.json()) as InterpretResponse;

    if (!Array.isArray(data)) return [];

    return data as ParsedCommand[];
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[interpretCommand] failed", err);
    return [];
  }
}