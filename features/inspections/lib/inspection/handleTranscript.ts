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

export async function handleTranscriptFn({
  command,
  session,
  updateItem,
}: HandleTranscriptArgs): Promise<void> {
  // Normalized fields
  let section: string | undefined;
  let item: string | undefined;
  let status: InspectionItemStatus | undefined;
  let note: string | undefined;
  let value: string | number | undefined;
  let unit: string | undefined;
  let mode: string; // which type of command

  if ("command" in command) {
    // Indexed shape
    const c = command as ParsedCommandIndexed;
    mode = c.command;
    status = c.status;
    note = c.notes;
    value = c.value;
    unit = c.unit;
  } else {
    // Name-based shape
    const c = command as ParsedCommandNameBased;
    mode = c.type;
    section = c.section;
    item = c.item;
    if ("status" in c) status = c.status;
    if ("note" in c) note = c.note;
    if ("value" in c) value = c.value;
    if ("unit" in c) unit = c.unit;
  }

  // Locate section & item by name (fallback)
  const sectionIndex = session.sections.findIndex((sec) =>
    section ? sec.title.toLowerCase().includes(section.toLowerCase()) : false,
  );
  const itemIndex =
    sectionIndex >= 0
      ? session.sections[sectionIndex].items.findIndex((it) =>
          item ? (it.name ?? it.item ?? "").toLowerCase().includes(item.toLowerCase()) : false,
        )
      : -1;

  if (sectionIndex === -1 || itemIndex === -1) {
    console.warn("Could not match section/item from transcript:", { section, item });
    return;
  }

  const itemUpdates: Partial<
    InspectionSession["sections"][number]["items"][number]
  > = {};

  switch (mode) {
    case "update_status":
    case "status":
      if (status) itemUpdates.status = status;
      break;

    case "update_value":
    case "measurement":
      if (value) itemUpdates.value = value;
      if (unit) itemUpdates.unit = unit;
      break;

    case "add_note":
    case "add":
      if (note) itemUpdates.notes = note;
      break;

    case "recommend":
      if (note) itemUpdates.recommend = [note];
      break;

    case "complete_item":
    case "skip_item":
      // no-op for now
      break;

    default:
      break;
  }

  if (Object.keys(itemUpdates).length > 0) {
    updateItem(sectionIndex, itemIndex, itemUpdates);
  }
}