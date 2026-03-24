import type {
  InspectionItemStatus,
  ParsedInspectionFindingCommand,
} from "@inspections/lib/inspection/types";

function norm(input: string): string {
  return String(input ?? "")
    .toLowerCase()
    .replace(/[^\w\s.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanLabel(input: string): string {
  return input
    .replace(/\b(fail|failed|recommend|recommended|rec|ok|okay|pass|good|na|n\/a)\b/gi, " ")
    .replace(/\b(photo|photos|picture|pictures)\b/gi, " ")
    .replace(/\b(add|open|take|capture)\b/gi, " ")
    .replace(/\b(parts?|labor|labour)\b/gi, " ")
    .replace(/\b(\d+(?:\.\d+)?)\s*(hr|hrs|hour|hours|h)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectStatus(input: string): InspectionItemStatus | null {
  const t = norm(input);

  if (/\b(fail|failed|bad|broken|worn|leaking|leak|cracked)\b/.test(t)) {
    return "fail";
  }
  if (/\b(recommend|recommended|rec|suggest)\b/.test(t)) {
    return "recommend";
  }
  if (/\b(ok|okay|pass|good)\b/.test(t)) {
    return "ok";
  }
  if (/\b(na|n\/a|not applicable)\b/.test(t)) {
    return "na";
  }

  return null;
}

function extractLaborHours(input: string): number | null {
  const m =
    input.match(/\b(\d+(?:\.\d+)?)\s*(?:hr|hrs|hour|hours)\b/i) ??
    input.match(/\b(\d+(?:\.\d+)?)\s*h\b/i);

  if (!m?.[1]) return null;

  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function wantsPhotoCapture(input: string): boolean {
  return /\b(add|take|open|capture)\s+(photo|photos|picture|pictures)\b/i.test(
    input,
  ) || /\b(photo|photos|picture|pictures)\b/i.test(input);
}

function extractParts(input: string): Array<{ description: string; qty: number }> {
  const lower = input.toLowerCase();

  const markerMatch = lower.match(/\b(parts?|need|needs|replace|replaced|with)\b/);
  if (!markerMatch?.index && markerMatch?.index !== 0) return [];

  const start = markerMatch.index + markerMatch[0].length;
  const tail = input.slice(start).trim();
  if (!tail) return [];

  const cleaned = tail
    .replace(/\b(add|also|and labor|labour|labor)\b/gi, " ")
    .replace(/\b(\d+(?:\.\d+)?)\s*(hr|hrs|hour|hours|h)\b/gi, " ")
    .replace(/\b(photo|photos|picture|pictures)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return [];

  return cleaned
    .split(/,| and /i)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((description) => ({ description, qty: 1 }));
}

function extractNote(input: string, status: InspectionItemStatus): string | undefined {
  const original = input.trim();
  if (!original) return undefined;

  let note = original;

  note = note.replace(/\b(add|open|take|capture)\s+(photo|photos|picture|pictures)\b/gi, " ");
  note = note.replace(/\b(photo|photos|picture|pictures)\b/gi, " ");
  note = note.replace(/\b(\d+(?:\.\d+)?)\s*(hr|hrs|hour|hours|h)\b/gi, " ");
  note = note.replace(/\b(parts?|need|needs|replace|replaced|with)\b[\s\S]*$/i, " ");

  if (status === "fail") {
    note = note.replace(/\b(fail|failed)\b/gi, " ");
  } else if (status === "recommend") {
    note = note.replace(/\b(recommend|recommended|rec|suggest)\b/gi, " ");
  } else if (status === "ok") {
    note = note.replace(/\b(ok|okay|pass|good)\b/gi, " ");
  } else if (status === "na") {
    note = note.replace(/\b(na|n\/a|not applicable)\b/gi, " ");
  }

  note = note.replace(/\s+/g, " ").trim();

  return note.length > 0 ? note : undefined;
}

function extractItemHint(input: string, status: InspectionItemStatus): string | undefined {
  let base = input;

  base = base.replace(/\b(add|open|take|capture)\s+(photo|photos|picture|pictures)\b/gi, " ");
  base = base.replace(/\b(photo|photos|picture|pictures)\b/gi, " ");
  base = base.replace(/\b(parts?|need|needs|replace|replaced|with)\b[\s\S]*$/i, " ");
  base = base.replace(/\b(\d+(?:\.\d+)?)\s*(hr|hrs|hour|hours|h)\b/gi, " ");

  if (status === "fail") {
    base = base.replace(/\b(fail|failed)\b/gi, " ");
  } else if (status === "recommend") {
    base = base.replace(/\b(recommend|recommended|rec|suggest)\b/gi, " ");
  } else if (status === "ok") {
    base = base.replace(/\b(ok|okay|pass|good)\b/gi, " ");
  } else if (status === "na") {
    base = base.replace(/\b(na|n\/a|not applicable)\b/gi, " ");
  }

  const label = cleanLabel(base);
  return label.length > 0 ? label : undefined;
}

export function parseInspectionFinding(
  input: string,
): ParsedInspectionFindingCommand | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;

  const status = detectStatus(raw);
  if (!status) return null;

  const item = extractItemHint(raw, status);
  if (!item) return null;

  const note = extractNote(raw, status);
  const laborHours = extractLaborHours(raw);
  const parts = extractParts(raw);
  const openPhotoCapture = wantsPhotoCapture(raw);

  return {
    type: "inspection_finding",
    item,
    status,
    note,
    parts: parts.length > 0 ? parts : undefined,
    laborHours,
    openPhotoCapture,
  };
}
