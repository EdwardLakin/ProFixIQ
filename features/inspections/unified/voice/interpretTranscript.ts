// features/inspections/unified/voice/interpretTranscript.ts

import type { VoiceCommand } from "./voiceTypes";

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractItemName(phrase: string): string | undefined {
  const match = phrase.match(/(?:for|on|at)\s+(.+)$/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  return undefined;
}

function extractSectionName(phrase: string): string | undefined {
  const match = phrase.match(/in\s+the\s+(.+?)\s+section/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  return undefined;
}

function extractStatusWord(lower: string): string | undefined {
  if (lower.includes("recommend")) return "recommend";
  if (lower.includes("fail") || lower.includes("bad")) return "fail";
  if (lower.includes("not applicable") || lower.includes("n a") || lower.includes("skip")) {
    return "na";
  }
  if (lower.includes("ok") || lower.includes("okay") || lower.includes("good") || lower.includes("pass")) {
    return "ok";
  }
  return undefined;
}

function extractMeasurement(phrase: string): { value: number; unit: string } | null {
  const match = phrase.match(
    /(\d+(?:\.\d+)?)\s*(mm|millimeters?|cm|centimeters?|inches?|inch|in|psi|kpa)/i,
  );
  if (!match) return null;

  const valueRaw = parseFloat(match[1]);
  if (Number.isNaN(valueRaw)) return null;

  let unit = match[2].toLowerCase();
  if (unit === "millimeter" || unit === "millimeters") unit = "mm";
  if (unit === "centimeter" || unit === "centimeters" || unit === "cm") unit = "cm";
  if (unit === "inch" || unit === "inches") unit = "in";

  return { value: valueRaw, unit };
}

function buildCommandFromPhrase(phrase: string): VoiceCommand | null {
  const raw = phrase.trim();
  if (!raw) return null;

  const lower = normalise(raw);
  const sectionName = extractSectionName(raw);
  const itemName = extractItemName(raw);

  // 1) Explicit measurement: "LF tire tread 8 mm", "set ... to 95 psi"
  const measurement = extractMeasurement(raw);
  if (measurement) {
    return {
      type: "measurement",
      raw,
      sectionName,
      itemName,
      value: measurement.value,
      unit: measurement.unit,
    };
  }

  // 2) Status change: "mark LF tire tread fail", "set left steer brake ok"
  const statusWord = extractStatusWord(lower);
  if (statusWord) {
    return {
      type: "update_status",
      raw,
      sectionName,
      itemName,
      status: statusWord,
    };
  }

  // 3) Recommendation: "recommend replacement on rear pads"
  if (lower.startsWith("recommend ")) {
    const name = itemName ?? raw.replace(/^recommend\s+/i, "").trim();
    return {
      type: "recommend",
      raw,
      sectionName,
      itemName: name || itemName,
      note: raw,
    };
  }

  // 4) Note: "note that rear shocks are leaking"
  if (lower.startsWith("note ") || lower.startsWith("add note ")) {
    const noteMatch = raw.match(/(?:note|add note)\s+(?:that\s+)?(.+)/i);
    const note = noteMatch && noteMatch[1] ? noteMatch[1].trim() : raw;
    return {
      type: "add_note",
      raw,
      sectionName,
      itemName,
      note,
    };
  }

  // 5) Complete item: "complete that item", "finish this check"
  if (
    lower.includes("complete item") ||
    lower.includes("complete this") ||
    lower.includes("finish item") ||
    lower.includes("finish this")
  ) {
    return {
      type: "complete_item",
      raw,
      sectionName,
      itemName,
    };
  }

  // Fallback: treat as a free-form note if we got at least an item hint
  if (itemName) {
    return {
      type: "add_note",
      raw,
      sectionName,
      itemName,
      note: raw,
    };
  }

  // Nothing we can confidently act on
  return null;
}

/**
 * Thin interpreter for the unified inspection voice controller.
 * For now this is fully rule-based so it works without any external AI calls.
 * Once your OpenAI Realtime interpreter is wired, we can swap its output
 * into the same VoiceCommand[] shape.
 */
export async function interpretTranscript(
  transcript: string,
): Promise<VoiceCommand[]> {
  const trimmed = transcript.trim();
  if (!trimmed) return [];

  // Split on obvious boundaries: ".", ",", " and then ", " next "
  const pieces = trimmed
    .split(/(?:\.|,|;|\band then\b|\bnext\b)/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const commands: VoiceCommand[] = [];

  for (const piece of pieces) {
    const cmd = buildCommandFromPhrase(piece);
    if (cmd) {
      commands.push(cmd);
    }
  }

  return commands;
}
