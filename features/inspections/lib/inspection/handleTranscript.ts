// features/inspections/lib/inspection/handleTranscript.ts

import {
  ParsedCommand,
  ParsedCommandNameBased,
  ParsedCommandIndexed,
  InspectionSession,
  InspectionItemStatus,
} from "@inspections/lib/inspection/types";

type UpdateInspectionFn = (updates: Partial<InspectionSession>) => void;

type UpdateItemFn = (
  sectionIndex: number,
  itemIndex: number,
  updates: Partial<InspectionSession["sections"][number]["items"][number]>,
) => void;

interface HandleTranscriptArgs {
  command: ParsedCommand;
  session: InspectionSession;
  updateInspection: UpdateInspectionFn;
  updateItem: UpdateItemFn;
  finishSession: () => void;
}

function clampIndex(n: number, maxExclusive: number): number {
  if (!Number.isFinite(n)) return 0;
  if (maxExclusive <= 0) return 0;
  return Math.min(Math.max(0, n), maxExclusive - 1);
}

function normalizeStatus(
  x: InspectionItemStatus | string | undefined,
): InspectionItemStatus | undefined {
  if (!x) return undefined;
  const v = String(x).toLowerCase().trim();

  if (v === "ok" || v === "pass") return "ok";
  if (v === "fail" || v === "failed") return "fail";
  if (v === "na" || v === "n/a" || v === "not applicable") return "na";
  if (v === "recommend" || v === "rec") return "recommend";

  return undefined;
}

function hasIndices(
  cmd: ParsedCommandIndexed,
): cmd is ParsedCommandIndexed & { sectionIndex: number; itemIndex: number } {
  return typeof cmd.sectionIndex === "number" && typeof cmd.itemIndex === "number";
}

function norm(s: unknown): string {
  return String(s ?? "").trim();
}
function normLower(s: unknown): string {
  return norm(s).toLowerCase();
}

function currentFocus(
  session: InspectionSession,
): { secIdx: number; itemIdx: number } | null {
  const secIdx = clampIndex(session.currentSectionIndex, session.sections.length);
  const itemsLen = session.sections[secIdx]?.items?.length ?? 0;
  if (itemsLen <= 0) return null;
  const itemIdx = clampIndex(session.currentItemIndex, itemsLen);
  return { secIdx, itemIdx };
}

/**
 * Name-based resolution:
 * - If BOTH section+item: search within matching section
 * - If item only: search across all sections
 * Preference order:
 *   1) exact case-insensitive match
 *   2) contains match
 * Tie-break:
 *   - prefer matches in current focused section
 */
function findByName(
  session: InspectionSession,
  section?: string,
  item?: string,
): { secIdx: number; itemIdx: number } | null {
  const itemRaw = norm(item);
  const sectionRaw = norm(section);

  if (!itemRaw && !sectionRaw) return null;

  const itemLower = normLower(itemRaw);
  const sectionLower = normLower(sectionRaw);

  const focus = currentFocus(session);
  const focusSec = focus?.secIdx ?? -1;

  const scoreLabel = (label: string): number => {
    const l = label.toLowerCase();
    if (!itemLower) return 0;
    if (l === itemLower) return 100; // exact
    if (l.includes(itemLower)) return 60; // contains
    return 0;
  };

  // If section provided, narrow to a matching section title
  if (sectionLower && itemLower) {
    const secIdx = session.sections.findIndex((sec) =>
      normLower(sec.title).includes(sectionLower),
    );
    if (secIdx < 0) return null;

    const items = session.sections[secIdx]?.items ?? [];
    let bestIdx = -1;
    let bestScore = 0;

    items.forEach((it, idx) => {
      const label = norm((it as { name?: unknown; item?: unknown }).name ?? (it as { item?: unknown }).item ?? "");
      const s = scoreLabel(label);
      if (s > bestScore) {
        bestScore = s;
        bestIdx = idx;
      }
    });

    if (bestIdx >= 0) return { secIdx, itemIdx: bestIdx };
    return null;
  }

  // Item-only: search across all sections
  if (itemLower) {
    type BestMatch = { secIdx: number; itemIdx: number; score: number; tie: number };
    let best: BestMatch | null = null;

    session.sections.forEach((sec, secIdx) => {
      const items = sec.items ?? [];
      items.forEach((it, itemIdx) => {
        const label = norm((it as { name?: unknown; item?: unknown }).name ?? (it as { item?: unknown }).item ?? "");
        const baseScore = scoreLabel(label);
        if (baseScore <= 0) return;

        const tie = secIdx === focusSec ? 10 : 0; // prefer current section
        const score = baseScore + tie;

        if (best === null || score > best.score) {
          best = { secIdx, itemIdx, score, tie };
        }
      });
    });

    // ✅ Explicit narrowing avoids the TS "never" issue seen in your screenshot
    if (best) {
      const { secIdx, itemIdx } = best;
      return { secIdx, itemIdx };
    }
    return null;
  }

  return null;
}

function resolveTarget(
  session: InspectionSession,
  cmd: ParsedCommandIndexed,
): { secIdx: number; itemIdx: number } | null {
  // 1) explicit indices win
  if (hasIndices(cmd)) {
    const secIdx = clampIndex(cmd.sectionIndex, session.sections.length);
    const itemsLen = session.sections[secIdx]?.items?.length ?? 0;
    if (itemsLen <= 0) return null;
    const itemIdx = clampIndex(cmd.itemIndex, itemsLen);
    return { secIdx, itemIdx };
  }

  // 2) name targeting (section optional)
  const byName = findByName(session, cmd.section, cmd.item);
  if (byName) return byName;

  // 3) fallback: current focus
  return currentFocus(session);
}

export async function handleTranscriptFn({
  command,
  session,
  updateInspection,
  updateItem,
  finishSession,
}: HandleTranscriptArgs): Promise<void> {
  let mode: string;

  // Common fields
  let status: InspectionItemStatus | undefined;
  let noteText: string | undefined;
  let value: string | number | undefined;
  let unit: string | undefined;

  // Parts/Labor fields
  let partName: string | undefined;
  let quantity: number | undefined;
  let hours: number | undefined;

  // Optional targeting
  let sectionName: string | undefined;
  let itemName: string | undefined;

  let indexedView: ParsedCommandIndexed | null = null;

  if ("command" in command) {
    const c = command as ParsedCommandIndexed;
    mode = c.command;

    status = normalizeStatus(c.status);
    noteText = norm((c as { note?: unknown; notes?: unknown }).note ?? (c as { notes?: unknown }).notes) || undefined;
    value = (c as { value?: unknown }).value as unknown as string | number | undefined;
    unit = norm((c as { unit?: unknown }).unit) || undefined;

    partName = norm((c as { partName?: unknown }).partName) || undefined;
    quantity =
      typeof (c as { quantity?: unknown }).quantity === "number" && Number.isFinite((c as { quantity: number }).quantity)
        ? (c as { quantity: number }).quantity
        : undefined;
    hours =
      typeof (c as { hours?: unknown }).hours === "number" && Number.isFinite((c as { hours: number }).hours)
        ? (c as { hours: number }).hours
        : undefined;

    sectionName = norm((c as { section?: unknown }).section) || undefined;
    itemName = norm((c as { item?: unknown }).item) || undefined;

    indexedView = c;
  } else {
    const c = command as ParsedCommandNameBased;
    mode = c.type;

    sectionName = norm((c as { section?: unknown }).section) || undefined;
    itemName = norm((c as { item?: unknown }).item) || undefined;

    if (c.type === "status") status = normalizeStatus((c as { status?: unknown }).status as string | undefined);
    if (c.type === "add") noteText = norm((c as { note?: unknown }).note) || undefined;
    if (c.type === "recommend") noteText = norm((c as { note?: unknown }).note) || undefined;
    if (c.type === "measurement") {
      value = (c as { value?: unknown }).value as unknown as string | number | undefined;
      unit = norm((c as { unit?: unknown }).unit) || undefined;
    }

    indexedView = {
      command:
        c.type === "status"
          ? "update_status"
          : c.type === "measurement"
            ? "update_value"
            : c.type === "add"
              ? "add_note"
              : "recommend",
      section: sectionName,
      item: itemName,
      status,
      value,
      unit,
      note: noteText,
    };
  }

  const m = normLower(mode);

  // Global commands
  if (m === "pause_inspection") {
    updateInspection({ isPaused: true, isListening: false, status: "paused" });
    return;
  }
  if (m === "finish_inspection") {
    finishSession();
    return;
  }

  if (!indexedView) return;

  const target = resolveTarget(session, {
    ...indexedView,
    section: sectionName ?? indexedView.section,
    item: itemName ?? indexedView.item,
  });
  if (!target) return;

  const { secIdx, itemIdx } = target;

  const itemUpdates: Partial<InspectionSession["sections"][number]["items"][number]> = {};

  switch (m) {
    case "update_status":
    case "status": {
      if (status) itemUpdates.status = status;
      if (noteText) itemUpdates.notes = noteText;

      // Focus on fail/recommend for follow-ups (parts/labor)
      if (status === "fail" || status === "recommend") {
        updateInspection({ currentSectionIndex: secIdx, currentItemIndex: itemIdx });
      }
      break;
    }

    case "update_value":
    case "measurement": {
      if (value !== undefined) itemUpdates.value = value;
      if (unit) itemUpdates.unit = unit;
      if (noteText) itemUpdates.notes = noteText;
      break;
    }

    case "add_note":
    case "add":
    case "note": {
      if (noteText) itemUpdates.notes = noteText;
      break;
    }

    case "recommend": {
      if (noteText) itemUpdates.recommend = [noteText];
      updateInspection({ currentSectionIndex: secIdx, currentItemIndex: itemIdx });
      break;
    }

    case "add_part": {
      const pn = norm(partName);
      if (!pn) break;

      const existing = session.sections[secIdx]?.items?.[itemIdx]?.parts ?? [];
      const qty = typeof quantity === "number" && Number.isFinite(quantity) ? quantity : 1;

      itemUpdates.parts = [
        ...existing,
        { description: pn, qty: Math.max(1, Math.floor(qty)) },
      ];
      if (noteText) itemUpdates.notes = noteText;
      break;
    }

    case "add_labor": {
      if (typeof hours !== "number" || !Number.isFinite(hours)) break;
      itemUpdates.laborHours = Math.max(0, hours);
      if (noteText) itemUpdates.notes = noteText;
      break;
    }

    case "complete_item":
    case "skip_item": {
      return;
    }

    default: {
      return;
    }
  }

  if (Object.keys(itemUpdates).length > 0) {
    updateItem(secIdx, itemIdx, itemUpdates);
  }
}