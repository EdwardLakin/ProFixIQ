// src/lib/inspection/handleTranscript.ts

import {
  ParsedCommand,
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
  const { section, item, status, value, notes } = command;

  // Locate matching section + item index based on names
  const sectionIndex = session.sections.findIndex((sec) =>
    sec.title.toLowerCase().includes(section?.toLowerCase() || ""),
  );

  const itemIndex =
    sectionIndex >= 0
      ? session.sections[sectionIndex].items.findIndex((it) =>
          it.name.toLowerCase().includes(item?.toLowerCase() || ""),
        )
      : -1;

  if (sectionIndex === -1 || itemIndex === -1) {
    console.warn("Could not match section/item from transcript:", {
      section,
      item,
    });
    return;
  }

  const itemUpdates: Partial<
    InspectionSession["sections"][number]["items"][number]
  > = {};

  switch (command.command) {
    case "update_status":
      if (status) itemUpdates.status = status as InspectionItemStatus;
      break;

    case "update_value":
      if (value) itemUpdates.value = value;
      break;

    case "add_note":
      if (notes) itemUpdates.notes = notes;
      break;

    case "recommend":
      if (notes) {
        itemUpdates.recommend = [notes];
      }
      break;

    case "complete_item":
    case "skip_item":
      // Add logic if needed later
      break;

    default:
      break;
  }

  if (Object.keys(itemUpdates).length > 0) {
    updateItem(sectionIndex, itemIndex, itemUpdates);
  }
}
