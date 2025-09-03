// features/inspections/lib/inspection/dispatchCommand.ts
import type {
  Command,
  InspectionSection,
  InspectionItem,
  InspectionItemStatus,
} from "./types";
import { resolveSynonym } from "./synonyms";

/** Legacy name-based command shape still used in a few places */
type NameBased =
  | { type: "status"; section: string; item: string; status: InspectionItemStatus }
  | { type: "add"; section: string; item: string; note: string }
  | { type: "recommend"; section: string; item: string; note: string }
  | { type: "measurement"; section: string; item: string; value: string | number; unit?: string }
  | { type: "pause" };

/** Helper: find section/item indices by names (legacy) */
function findIndicesByName(
  sections: InspectionSection[],
  sectionName: string,
  itemName: string,
): { sectionIndex: number; itemIndex: number } | null {
  const sName = resolveSynonym(sectionName);
  const iName = resolveSynonym(itemName);

  const sectionIndex = sections.findIndex(
    (s) => resolveSynonym(s.title) === sName,
  );
  if (sectionIndex < 0) return null;

  const itemIndex = sections[sectionIndex].items.findIndex((it) =>
    resolveSynonym(it.item ?? it.name ?? "") === iName,
  );
  if (itemIndex < 0) return null;

  return { sectionIndex, itemIndex };
}

/** Normalize either a new Command (indexed) or old name-based into an indexed Command */
function toIndexedCommand(
  cmd: Command | NameBased,
  sections: InspectionSection[],
): Command | null {
  if ("sectionIndex" in cmd && "itemIndex" in cmd) {
    // Already a new-style indexed Command
    return cmd as Command;
  }

  // Map legacy name-based -> indexed Command
  const nb = cmd as NameBased;
  if (nb.type === "pause") return { type: "pause" };

  const idx = findIndicesByName(sections, (nb as any).section, (nb as any).item);
  if (!idx) return null;

  switch (nb.type) {
    case "status":
      return {
        type: "update_status",
        sectionIndex: idx.sectionIndex,
        itemIndex: idx.itemIndex,
        status: nb.status,
      };
    case "add":
      return {
        type: "add_note",
        sectionIndex: idx.sectionIndex,
        itemIndex: idx.itemIndex,
        notes: nb.note,
      };
    case "recommend":
      return {
        type: "recommend",
        sectionIndex: idx.sectionIndex,
        itemIndex: idx.itemIndex,
        recommendation: nb.note,
      };
    case "measurement":
      return {
        type: "update_value",
        sectionIndex: idx.sectionIndex,
        itemIndex: idx.itemIndex,
        value: nb.value,
        unit: nb.unit,
      };
    default:
      return null;
  }
}

/** Immutably update one item inside sections */
function updateItemAt(
  sections: InspectionSection[],
  sectionIndex: number,
  itemIndex: number,
  mutator: (prev: InspectionItem) => InspectionItem,
): InspectionSection[] {
  return sections.map((s, si) =>
    si !== sectionIndex
      ? s
      : {
          ...s,
          items: s.items.map((it, ii) => (ii === itemIndex ? mutator(it) : it)),
        },
  );
}

export function dispatchCommand(
  command: Command | NameBased,
  sections: InspectionSection[],
): InspectionSection[] {
  const idxCmd = toIndexedCommand(command, sections);
  if (!idxCmd) return sections;

  switch (idxCmd.type) {
    case "update_status": {
      const { sectionIndex, itemIndex, status } = idxCmd;
      return updateItemAt(sections, sectionIndex, itemIndex, (it) => ({
        ...it,
        status,
      }));
    }

    case "add_note": {
      const { sectionIndex, itemIndex, notes } = idxCmd;
      return updateItemAt(sections, sectionIndex, itemIndex, (it) => ({
        ...it,
        notes,
      }));
    }

    case "recommend": {
      const { sectionIndex, itemIndex, recommendation } = idxCmd;
      return updateItemAt(sections, sectionIndex, itemIndex, (it) => ({
        ...it,
        recommend: [...(it.recommend ?? []), recommendation],
      }));
    }

    case "update_value": {
      const { sectionIndex, itemIndex, value, unit } = idxCmd;
      return updateItemAt(sections, sectionIndex, itemIndex, (it) => ({
        ...it,
        value,
        unit: unit ?? it.unit ?? null,
      }));
    }

    // These are no-ops for visual state here; keep immutable passthroughs.
    case "complete":
    case "skip":
    case "pause":
    case "finish":
    default:
      return sections;
  }
}