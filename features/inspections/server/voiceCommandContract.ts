// Defensive parsing contract for inspection voice commands returned by
// /api/ai/interpret's model call.
//
// This mirrors the discipline the Technician CoPilot's closed action
// contract already uses (see
// features/copilot/technician/server/actionContract.ts): every field is
// validated and bounded rather than cast straight from the model's JSON, and
// a malformed or out-of-range entry is dropped instead of being applied to
// inspection state. Previously the route only checked that `command` was a
// string (`safeJsonParseArray`) and cast the rest of the object straight
// through — an unbounded note, a `status` outside the four allowed values,
// a non-numeric `value`, or an unexpected shape would all have flowed
// through to the client unchanged.

export type InspectionVoiceCommandStatus = "ok" | "fail" | "na" | "recommend";
export type InspectionVoiceCommandSide = "left" | "right";

export type InspectionVoicePart = { description: string; qty: number };

export type InspectionVoiceCommand =
  | {
      command: "update_status";
      section?: string;
      item?: string;
      side?: InspectionVoiceCommandSide;
      status: InspectionVoiceCommandStatus;
      note?: string;
    }
  | {
      command: "update_value";
      section?: string;
      item?: string;
      side?: InspectionVoiceCommandSide;
      value: number | string;
      unit?: string;
      note?: string;
    }
  | {
      command: "add_note";
      section?: string;
      item?: string;
      side?: InspectionVoiceCommandSide;
      note: string;
    }
  | {
      command: "recommend";
      section?: string;
      item?: string;
      side?: InspectionVoiceCommandSide;
      note: string;
    }
  | {
      command: "add_part";
      section?: string;
      item?: string;
      side?: InspectionVoiceCommandSide;
      partName: string;
      quantity?: number;
    }
  | {
      command: "add_labor";
      section?: string;
      item?: string;
      side?: InspectionVoiceCommandSide;
      hours: number;
      label?: string;
    }
  | {
      command: "section_status";
      section: string;
      status: InspectionVoiceCommandStatus;
      note?: string;
    }
  | {
      command: "oneshot_item";
      section?: string;
      item?: string;
      status: InspectionVoiceCommandStatus;
      note?: string;
      parts?: InspectionVoicePart[];
      laborHours?: number | null;
    }
  | {
      command: "complete_item";
      section?: string;
      item?: string;
      side?: InspectionVoiceCommandSide;
    }
  | {
      command: "skip_item";
      section?: string;
      item?: string;
      side?: InspectionVoiceCommandSide;
    }
  | { command: "pause_inspection" }
  | { command: "finish_inspection" };

const STATUS_VALUES = new Set<InspectionVoiceCommandStatus>([
  "ok",
  "fail",
  "na",
  "recommend",
]);
const SIDE_VALUES = new Set<InspectionVoiceCommandSide>(["left", "right"]);
const MAX_ONESHOT_PARTS = 20;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().slice(0, maxLength);
  return normalized || undefined;
}

function status(value: unknown): InspectionVoiceCommandStatus | undefined {
  return typeof value === "string" &&
    STATUS_VALUES.has(value as InspectionVoiceCommandStatus)
    ? (value as InspectionVoiceCommandStatus)
    : undefined;
}

function side(value: unknown): InspectionVoiceCommandSide | undefined {
  return typeof value === "string" &&
    SIDE_VALUES.has(value as InspectionVoiceCommandSide)
    ? (value as InspectionVoiceCommandSide)
    : undefined;
}

// The transcript's spoken note may arrive under either `note` or `notes`
// depending on which field the model chose to fill; the client only reads
// `note`, so this collapses both onto that one bounded field.
function note(entry: Record<string, unknown>): string | undefined {
  return text(entry.note, 1_000) ?? text(entry.notes, 1_000);
}

function requiredNote(entry: Record<string, unknown>): string | null {
  return note(entry) ?? null;
}

// `value` may legitimately be a number ("8" mm) or a short qualitative
// string ("worn", "leaking") the model chose to report as a measurement.
// Either way it must be bounded — an unbounded string here would otherwise
// flow straight into inspection state.
function measurementValue(value: unknown): number | string | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) && Math.abs(value) <= 100_000
      ? value
      : undefined;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber) && Math.abs(asNumber) <= 100_000) {
      return asNumber;
    }
    return trimmed.slice(0, 32);
  }
  return undefined;
}

function quantity(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 10_000
    ? Math.floor(parsed)
    : undefined;
}

function laborHours(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 24
    ? parsed
    : undefined;
}

function oneshotParts(value: unknown): InspectionVoicePart[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const parts: InspectionVoicePart[] = [];
  for (const candidate of value) {
    if (parts.length >= MAX_ONESHOT_PARTS) break;
    const entry = record(candidate);
    const description = text(entry?.description, 200);
    const qty = quantity(entry?.qty);
    if (!description || qty === undefined) continue;
    parts.push({ description, qty });
  }
  return parts.length > 0 ? parts : undefined;
}

/**
 * Validates one candidate command against the closed command-type union.
 * Returns null for anything unrecognized or missing a field it cannot work
 * without, so the caller drops it instead of applying a guessed shape.
 */
export function parseInspectionVoiceCommand(
  candidate: unknown,
): InspectionVoiceCommand | null {
  const entry = record(candidate);
  if (!entry || typeof entry.command !== "string") return null;

  const section = text(entry.section, 200);
  const item = text(entry.item, 200);
  const commandSide = side(entry.side);

  switch (entry.command) {
    case "update_status": {
      const st = status(entry.status);
      if (!st) return null;
      return {
        command: "update_status",
        section,
        item,
        side: commandSide,
        status: st,
        note: note(entry),
      };
    }
    case "update_value": {
      const value = measurementValue(entry.value);
      if (value === undefined) return null;
      return {
        command: "update_value",
        section,
        item,
        side: commandSide,
        value,
        unit: text(entry.unit, 16),
        note: note(entry),
      };
    }
    case "add_note": {
      const noteText = requiredNote(entry);
      if (!noteText) return null;
      return {
        command: "add_note",
        section,
        item,
        side: commandSide,
        note: noteText,
      };
    }
    case "recommend": {
      const noteText = requiredNote(entry);
      if (!noteText) return null;
      return {
        command: "recommend",
        section,
        item,
        side: commandSide,
        note: noteText,
      };
    }
    case "add_part": {
      const partName = text(entry.partName, 200);
      if (!partName) return null;
      return {
        command: "add_part",
        section,
        item,
        side: commandSide,
        partName,
        quantity: quantity(entry.quantity),
      };
    }
    case "add_labor": {
      const hours = laborHours(entry.hours);
      if (hours === undefined) return null;
      return {
        command: "add_labor",
        section,
        item,
        side: commandSide,
        hours,
        label: text(entry.label, 200),
      };
    }
    case "section_status": {
      const sectionName = text(entry.section, 200);
      const st = status(entry.status);
      if (!sectionName || !st) return null;
      return {
        command: "section_status",
        section: sectionName,
        status: st,
        note: note(entry),
      };
    }
    case "oneshot_item": {
      const st = status(entry.status);
      if (!st) return null;
      const hours = entry.laborHours == null ? null : laborHours(entry.laborHours);
      return {
        command: "oneshot_item",
        section,
        item,
        status: st,
        note: note(entry),
        parts: oneshotParts(entry.parts),
        laborHours: hours ?? null,
      };
    }
    case "complete_item":
      return { command: "complete_item", section, item, side: commandSide };
    case "skip_item":
      return { command: "skip_item", section, item, side: commandSide };
    case "pause_inspection":
      return { command: "pause_inspection" };
    case "finish_inspection":
      return { command: "finish_inspection" };
    default:
      return null;
  }
}

const MAX_COMMANDS = 50;

/**
 * Parses the model's raw JSON text into a bounded list of validated
 * commands. Any parse failure, non-array response, or invalid entry yields
 * an empty result or a shorter list rather than throwing or passing
 * unvalidated data through.
 */
export function parseInspectionVoiceCommandList(
  raw: string,
): InspectionVoiceCommand[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const commands: InspectionVoiceCommand[] = [];
  for (const candidate of parsed) {
    if (commands.length >= MAX_COMMANDS) break;
    const command = parseInspectionVoiceCommand(candidate);
    if (command) commands.push(command);
  }
  return commands;
}
