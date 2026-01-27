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
type UpdateSectionFn = (
  sectionIndex: number,
  updates: Partial<InspectionSession["sections"][number]>,
) => void;

interface HandleTranscriptArgs {
  command: ParsedCommand;
  session: InspectionSession;
  updateInspection: UpdateInspectionFn;
  updateItem: UpdateItemFn;
  updateSection: UpdateSectionFn;
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
  return (
    typeof cmd.sectionIndex === "number" && typeof cmd.itemIndex === "number"
  );
}

function findByName(
  session: InspectionSession,
  section?: string,
  item?: string,
): { secIdx: number; itemIdx: number } | null {
  if (!section || !item) return null;

  const secLower = section.toLowerCase();
  const itemLower = item.toLowerCase();

  const secIdx = session.sections.findIndex((sec) =>
    String(sec.title ?? "").toLowerCase().includes(secLower),
  );
  if (secIdx < 0) return null;

  const items = session.sections[secIdx]?.items ?? [];
  const itemIdx = items.findIndex((it) => {
    const label = String(it.name ?? it.item ?? "").toLowerCase();
    return label.includes(itemLower);
  });

  if (itemIdx < 0) return null;

  return { secIdx, itemIdx };
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

  // 2) optional name targeting (if provided)
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
  // Normalize to the "indexed-like" interpretation so we can handle both shapes consistently
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

  // Build an Indexed command object view for targeting
  let indexedView: ParsedCommandIndexed | null = null;

  if ("command" in command) {
    const c = command as ParsedCommandIndexed;
    mode = c.command;

    status = normalizeStatus(c.status);
    noteText = (c.note ?? c.notes)?.trim() || undefined;
    value = c.value;
    unit = c.unit;

    partName = c.partName?.trim() || undefined;
    quantity =
      typeof c.quantity === "number" && Number.isFinite(c.quantity)
        ? c.quantity
        : undefined;
    hours =
      typeof c.hours === "number" && Number.isFinite(c.hours) ? c.hours : undefined;

    sectionName = c.section?.trim() || undefined;
    itemName = c.item?.trim() || undefined;

    indexedView = c;
  } else {
    const c = command as ParsedCommandNameBased;
    mode = c.type;

    // name-based always targets by name
    sectionName = c.section;
    itemName = c.item;

    if (c.type === "status") status = normalizeStatus(c.status);
    if (c.type === "add") noteText = c.note?.trim() || undefined;
    if (c.type === "recommend") noteText = c.note?.trim() || undefined;
    if (c.type === "measurement") {
      value = c.value;
      unit = c.unit;
    }

    // Convert to indexed-view for unified targeting resolution
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

  const m = String(mode).toLowerCase().trim();

  // Global commands (don’t need item target)
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

  const itemUpdates: Partial<
    InspectionSession["sections"][number]["items"][number]
  > = {};

  switch (m) {
    case "update_status":
    case "status": {
      if (status) itemUpdates.status = status;
      if (noteText) itemUpdates.notes = noteText;

      // ✅ Focus the item when it becomes FAIL/RECOMMEND (enables follow-up voice like “yes add parts/labor”)
      if (status === "fail" || status === "recommend") {
        updateInspection({ currentSectionIndex: secIdx, currentItemIndex: itemIdx });
      }

      break;
    }

    case "update_value":
    case "measurement": {
      // Allow 0 / empty string values; just require value !== undefined
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
      // Keep your model: recommend is string[]
      if (noteText) itemUpdates.recommend = [noteText];

      // ✅ Focus the item on recommend command too (same follow-up behavior)
      updateInspection({ currentSectionIndex: secIdx, currentItemIndex: itemIdx });

      break;
    }

    case "add_part": {
      const pn = partName?.trim();
      if (!pn) break;

      const existing = session.sections[secIdx]?.items?.[itemIdx]?.parts ?? [];
      const qty =
        typeof quantity === "number" && Number.isFinite(quantity) ? quantity : 1;

      const next = [
        ...existing,
        { description: pn, qty: Math.max(1, Math.floor(qty)) },
      ];

      itemUpdates.parts = next;
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
      // No-op here; your UI handles auto-advance / completion behavior
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