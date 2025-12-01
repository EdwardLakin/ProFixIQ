// features/inspections/unified/voice/commandMapper.ts

import type { VoiceCommand } from "./voiceTypes";
import type {
  InspectionSession,
  InspectionItemStatus,
  InspectionSection,
} from "@inspections/lib/inspection/types";

type UpdateSessionFn = (patch: Partial<InspectionSession>) => void;

type TargetIndex = {
  sectionIndex: number;
  itemIndex: number;
};

function normalise(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mapStatusWord(word: string | undefined): InspectionItemStatus | null {
  if (!word) return null;
  const lower = word.toLowerCase();

  if (lower === "recommend" || lower.startsWith("rec")) return "recommend";
  if (lower === "fail" || lower.includes("bad")) return "fail";
  if (lower === "na" || lower.includes("not applicable") || lower.includes("skip")) {
    return "na";
  }
  if (lower === "ok" || lower === "okay" || lower.includes("good") || lower.includes("pass")) {
    return "ok";
  }

  return null;
}

function cloneSections(sections: InspectionSection[]): InspectionSection[] {
  return sections.map((section) => ({
    ...section,
    items: (section.items ?? []).map((item) => ({ ...item })),
  }));
}

/**
 * Fuzzy match against section + item labels based on a VoiceCommand.
 * - If `sectionName` provided, prefer that section.
 * - Fall back to first matching item anywhere.
 */
function findTargetItem(
  sections: InspectionSection[],
  cmd: VoiceCommand,
): TargetIndex | null {
  const itemNeedle = normalise(cmd.itemName);
  const sectionNeedle = normalise(cmd.sectionName);

  if (!itemNeedle && !sectionNeedle) return null;

  const matches: TargetIndex[] = [];

  sections.forEach((section, sIdx) => {
    const sectionTitle = normalise(section.title);
    const sectionScore =
      sectionNeedle && sectionTitle.includes(sectionNeedle) ? 1 : 0;

    section.items.forEach((item, iIdx) => {
      const label = normalise(item.item ?? item.name ?? "");
      if (!label) return;

      const itemMatch =
        itemNeedle && (label.includes(itemNeedle) || itemNeedle.includes(label));

      if (itemMatch || sectionScore > 0) {
        matches.push({ sectionIndex: sIdx, itemIndex: iIdx });
      }
    });
  });

  if (matches.length === 0) return null;

  // Prefer first match – this is deterministic and easy to reason about.
  return matches[0];
}

function applyStatusCommand(
  sections: InspectionSection[],
  target: TargetIndex | null,
  status: InspectionItemStatus | null,
): InspectionSection[] {
  if (!target || !status) return sections;

  const next = cloneSections(sections);
  const section = next[target.sectionIndex];
  const item = section?.items[target.itemIndex];
  if (!item) return sections;

  item.status = status;
  return next;
}

function applyMeasurementCommand(
  sections: InspectionSection[],
  target: TargetIndex | null,
  value: string | number | undefined,
  unit: string | undefined,
): InspectionSection[] {
  if (!target || value === undefined) return sections;

  const next = cloneSections(sections);
  const section = next[target.sectionIndex];
  const item = section?.items[target.itemIndex];
  if (!item) return sections;

  item.value = value;
  if (unit) {
    item.unit = unit;
  }
  return next;
}

function appendNote(
  existing: string | undefined,
  note: string | undefined,
): string | undefined {
  if (!note || note.trim().length === 0) return existing;
  if (!existing || existing.trim().length === 0) return note.trim();
  return `${existing.trim()}\n${note.trim()}`;
}

function applyNoteCommand(
  sections: InspectionSection[],
  target: TargetIndex | null,
  note: string | undefined,
  markRecommend: boolean,
): InspectionSection[] {
  if (!target || !note) return sections;

  const next = cloneSections(sections);
  const section = next[target.sectionIndex];
  const item = section?.items[target.itemIndex];
  if (!item) return sections;

  item.notes = appendNote(item.notes, note);
  if (markRecommend) {
    item.status = "recommend";
    const existingRecs = Array.isArray(item.recommend) ? item.recommend : [];
    item.recommend = [...existingRecs, note];
  }

  return next;
}

function applyCompleteCommand(
  sections: InspectionSection[],
  target: TargetIndex | null,
): InspectionSection[] {
  if (!target) return sections;

  const next = cloneSections(sections);
  const section = next[target.sectionIndex];
  const item = section?.items[target.itemIndex];
  if (!item) return sections;

  // If already has explicit status, leave it; otherwise treat as OK.
  if (!item.status) {
    item.status = "ok";
  }

  return next;
}

/**
 * Apply a batch of voice commands to a session and push a single patch
 * into the unified inspection state.
 */
export function applyVoiceCommands(
  commands: VoiceCommand[],
  session: InspectionSession,
  updateSession: UpdateSessionFn,
): void {
  if (commands.length === 0) return;

  const originalSections = session.sections ?? [];
  let sections: InspectionSection[] = cloneSections(originalSections);

  let transcript = session.transcript ?? "";
  const rawPieces: string[] = [];

  commands.forEach((cmd) => {
    const target = findTargetItem(sections, cmd);

    switch (cmd.type) {
      case "update_status": {
        const status = mapStatusWord(cmd.status);
        sections = applyStatusCommand(sections, target, status);
        break;
      }
      case "measurement": {
        sections = applyMeasurementCommand(
          sections,
          target,
          cmd.value,
          cmd.unit,
        );
        break;
      }
      case "add_note": {
        sections = applyNoteCommand(
          sections,
          target,
          cmd.note ?? cmd.raw,
          false,
        );
        break;
      }
      case "recommend": {
        sections = applyNoteCommand(
          sections,
          target,
          cmd.note ?? cmd.raw,
          true,
        );
        break;
      }
      case "complete_item": {
        sections = applyCompleteCommand(sections, target);
        break;
      }
      default:
        // Exhaustive check – if we add a new VoiceCommandType later,
        // TypeScript will remind us to handle it.
        const _never: never = cmd.type;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        void _never;
    }

    rawPieces.push(cmd.raw);
  });

  if (rawPieces.length > 0) {
    const addition = rawPieces.join(" ");
    transcript = transcript ? `${transcript} ${addition}` : addition;
  }

  const patch: Partial<InspectionSession> = {
    sections,
    transcript,
  };

  updateSession(patch);
}