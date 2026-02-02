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

/* -------------------------------------------------------------------------------------------------
 * Resolver: turn messy tech speech into a concrete sectionIndex/itemIndex
 * - Works for grid labels (LF/RF/LR/RR, "Left Front", axle/sides, etc.)
 * - Works for regular section items
 * - Prefers current section first, but can search all sections
 * ------------------------------------------------------------------------------------------------- */

type Target = { sectionIndex: number; itemIndex: number };

function norm(input: string): string {
  return (input || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(input: string): string[] {
  const n = norm(input);
  if (!n) return [];
  return n.split(" ").filter((w) => w.length >= 2);
}

// Keep tokens techs actually say, and map them to canonical tokens found in labels
const SYNONYMS: Array<{ re: RegExp; tokens: string[] }> = [
  // corners / positions
  { re: /\b(left\s*front|lf)\b/i, tokens: ["lf", "left front"] },
  { re: /\b(right\s*front|rf)\b/i, tokens: ["rf", "right front"] },
  { re: /\b(left\s*rear|lr)\b/i, tokens: ["lr", "left rear"] },
  { re: /\b(right\s*rear|rr)\b/i, tokens: ["rr", "right rear"] },

  // driver/passenger synonyms (optional)
  { re: /\b(driver\s*front)\b/i, tokens: ["lf", "left front"] },
  { re: /\b(passenger\s*front)\b/i, tokens: ["rf", "right front"] },
  { re: /\b(driver\s*rear)\b/i, tokens: ["lr", "left rear"] },
  { re: /\b(passenger\s*rear)\b/i, tokens: ["rr", "right rear"] },

  // common metrics (brakes)
  { re: /\b(pad|pads|shoe|shoes|lining)\b/i, tokens: ["pad", "pads", "shoe", "shoes", "lining"] },
  { re: /\b(rotor|drum)\b/i, tokens: ["rotor", "drum"] },
  { re: /\b(push\s*rod|pushrod)\b/i, tokens: ["push rod", "pushrod"] },

  // tires
  { re: /\b(tire\s*pressure|tyre\s*pressure|pressure)\b/i, tokens: ["tire pressure", "pressure"] },
  { re: /\b(tread\s*depth|tread)\b/i, tokens: ["tread depth", "tread"] },
  { re: /\b(wheel\s*torque|lug\s*torque|torque)\b/i, tokens: ["wheel torque", "torque"] },

  // air system / leak checks
  { re: /\b(leak\s*rate)\b/i, tokens: ["leak rate"] },
  { re: /\b(governor|gov\s*cut|cut\s*out|cut\s*in)\b/i, tokens: ["gov", "governor", "cut out", "cut in"] },

  // battery / electrical
  { re: /\b(voltage|volts|v\b)\b/i, tokens: ["voltage"] },
  { re: /\b(cca|cranking)\b/i, tokens: ["cca", "cranking"] },
  { re: /\b(alternator|charging|charge\s*rate)\b/i, tokens: ["alternator", "charging", "charge rate"] },
  { re: /\b(soc|state\s*of\s*charge)\b/i, tokens: ["soc", "state of charge"] },
];

// If we hear “steer axle” or “drive axle”, keep those tokens too.
// These help match “Axle 1 Left …” style labels.
const AXLE_HINTS: Array<{ re: RegExp; tokens: string[] }> = [
  { re: /\b(steer\s*axle|front\s*axle)\b/i, tokens: ["steer", "front axle", "axle 1"] },
  { re: /\b(drive\s*axle)\b/i, tokens: ["drive", "axle"] },
  { re: /\b(trailer\s*axle)\b/i, tokens: ["trailer", "axle"] },
  { re: /\b(axle\s*(\d+))\b/i, tokens: ["axle"] }, // we still add "axle"; numeric matching handled separately
];

function extractHintTokens(text: string): string[] {
  const raw = text || "";
  const out: string[] = [];

  for (const m of SYNONYMS) {
    if (m.re.test(raw)) out.push(...m.tokens);
  }

  for (const m of AXLE_HINTS) {
    if (m.re.test(raw)) out.push(...m.tokens);
  }

  // include raw tokens too (but de-emphasized by scoring)
  out.push(...tokenize(raw));

  // de-dupe
  return Array.from(new Set(out.map((t) => norm(t))));
}

function scoreLabel(label: string, hintTokens: string[]): number {
  const l = norm(label);
  if (!l) return 0;

  let score = 0;

  // Strong signals: corners
  if (l.includes("lf")) score += 0; // neutral baseline; we rely on matches below

  for (const tok of hintTokens) {
    if (!tok) continue;

    // corner tokens are very valuable
    if (tok === "lf" || tok === "rf" || tok === "lr" || tok === "rr") {
      if (l.includes(tok)) score += 70;
      continue;
    }

    if (tok === "left front" || tok === "right front" || tok === "left rear" || tok === "right rear") {
      if (l.includes(tok)) score += 70;
      continue;
    }

    // metric tokens are medium value
    if (tok === "tire pressure" || tok === "tread depth" || tok === "wheel torque") {
      if (l.includes(tok)) score += 25;
      continue;
    }

    if (tok === "pressure") {
      if (l.includes("pressure")) score += 18;
      continue;
    }

    if (tok === "tread") {
      if (l.includes("tread")) score += 18;
      continue;
    }

    if (tok === "pad" || tok === "pads" || tok === "shoe" || tok === "shoes" || tok === "lining") {
      if (l.includes("pad") || l.includes("shoe") || l.includes("lining")) score += 20;
      continue;
    }

    if (tok === "rotor" || tok === "drum") {
      if (l.includes("rotor") || l.includes("drum")) score += 20;
      continue;
    }

    if (tok === "push rod" || tok === "pushrod") {
      if (l.includes("push rod") || l.includes("pushrod")) score += 20;
      continue;
    }

    if (tok === "voltage") {
      if (l.includes("voltage")) score += 20;
      continue;
    }

    if (tok === "cca" || tok === "cranking") {
      if (l.includes("cca") || l.includes("cranking")) score += 18;
      continue;
    }

    if (tok === "charging" || tok === "alternator" || tok === "charge rate") {
      if (l.includes("charging") || l.includes("alternator") || l.includes("charge")) score += 18;
      continue;
    }

    // axle hints
    if (tok === "axle" || tok === "steer" || tok === "drive" || tok === "trailer") {
      if (l.includes(tok)) score += 10;
      continue;
    }

    // generic token match (low value)
    if (tok.length >= 3 && l.includes(tok)) score += 3;
  }

  return score;
}

function scoreSectionTitle(title: string, hintTokens: string[]): number {
  const t = norm(title);
  if (!t) return 0;

  let score = 0;
  for (const tok of hintTokens) {
    if (!tok) continue;

    // if hint includes "battery"/"tires"/"brakes"/etc, allow section title to influence
    if (tok.length >= 4 && t.includes(tok)) score += 8;
  }

  // explicit “section” hints should help a bit
  if (t.includes("battery") && hintTokens.includes("voltage")) score += 10;
  if (t.includes("tire") && (hintTokens.includes("tread") || hintTokens.includes("pressure"))) score += 10;
  if (t.includes("brake") && (hintTokens.includes("pad") || hintTokens.includes("rotor"))) score += 10;

  return score;
}

function resolveTargetFromSpeech(args: {
  speech: string;
  sections: InspectionSession["sections"];
  preferredSectionIndex?: number;
  explicitSectionName?: string;
}): Target | null {
  const { speech, sections, preferredSectionIndex, explicitSectionName } = args;
  if (!Array.isArray(sections) || sections.length === 0) return null;

  const hints = extractHintTokens(speech);

  const sectionOrder: number[] = [];
  if (typeof preferredSectionIndex === "number" && preferredSectionIndex >= 0 && preferredSectionIndex < sections.length) {
    sectionOrder.push(preferredSectionIndex);
  }
  for (let i = 0; i < sections.length; i++) {
    if (i !== preferredSectionIndex) sectionOrder.push(i);
  }

  // If caller gave an explicit section phrase, try to bias toward matching sections first
  const explicitSection = explicitSectionName ? norm(explicitSectionName) : "";

  let best: { score: number; target: Target } | null = null;

  for (const sIdx of sectionOrder) {
    const sec = sections[sIdx];
    const secTitle = String(sec?.title ?? "");
    const items = Array.isArray(sec?.items) ? sec.items : [];

    // Section gate: if explicit section is present, skip sections that don't match at all
    if (explicitSection) {
      const st = norm(secTitle);
      if (!st.includes(explicitSection)) continue;
    }

    const secScore = scoreSectionTitle(secTitle, hints);

    for (let iIdx = 0; iIdx < items.length; iIdx++) {
      const label = String(items[iIdx]?.item ?? items[iIdx]?.name ?? "");
      if (!label) continue;

      const ls = scoreLabel(label, hints);
      const total = ls + secScore;

      if (total <= 0) continue;

      if (!best || total > best.score) {
        best = { score: total, target: { sectionIndex: sIdx, itemIndex: iIdx } };
      }
    }

    // Early exit if we found a very strong match in preferred section
    if (best && typeof preferredSectionIndex === "number" && sIdx === preferredSectionIndex && best.score >= 85) {
      break;
    }
  }

  // minimum confidence so we don’t write into random fields
  if (!best || best.score < 20) return null;
  return best.target;
}

/* -------------------------------------------------------------------------------------------------
 * Helper: best-effort "tech phrase" builder from ParsedCommand
 * We don’t always get raw speech here; we use fields we do have.
 * ------------------------------------------------------------------------------------------------- */

function buildSpeechHintFromCommand(params: {
  section?: string;
  item?: string;
  note?: string;
  unit?: string;
}): string {
  const parts: string[] = [];
  if (params.section) parts.push(params.section);
  if (params.item) parts.push(params.item);
  if (params.note) parts.push(params.note);
  if (params.unit) parts.push(params.unit);
  return parts.join(" ").trim();
}

/* -------------------------------------------------------------------------------------------------
 * Main apply
 * ------------------------------------------------------------------------------------------------- */

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
  let mode: string;

  // For indexed commands, default to current item unless the resolver finds a better match
  const preferredSectionIndex =
    typeof session.currentSectionIndex === "number" ? session.currentSectionIndex : 0;
  const preferredItemIndex =
    typeof session.currentItemIndex === "number" ? session.currentItemIndex : 0;

  if ("command" in command) {
    const c = command as ParsedCommandIndexed;
    mode = c.command;
    status = c.status;
    note = c.notes;
    value = c.value;
    unit = c.unit;
  } else {
    const c = command as ParsedCommandNameBased;
    mode = c.type;
    section = c.section;
    item = c.item;
    if ("status" in c) status = c.status;
    if ("note" in c) note = c.note;
    if ("value" in c) value = c.value;
    if ("unit" in c) unit = c.unit;
  }

  // 1) First try explicit name matching (fast path)
  const sectionIndexByName =
    section && section.trim().length > 0
      ? session.sections.findIndex((sec) =>
          String(sec.title ?? "").toLowerCase().includes(section.toLowerCase()),
        )
      : -1;

  const itemIndexByName =
    sectionIndexByName >= 0 && item && item.trim().length > 0
      ? session.sections[sectionIndexByName].items.findIndex((it) =>
          String(it.name ?? it.item ?? "")
            .toLowerCase()
            .includes(item.toLowerCase()),
        )
      : -1;

  // 2) If name matching fails OR item wasn’t provided, use resolver
  let target: Target | null = null;

  if (sectionIndexByName >= 0 && itemIndexByName >= 0) {
    target = { sectionIndex: sectionIndexByName, itemIndex: itemIndexByName };
  } else {
    // Build a “speech hint” from what we have (works with phrases like:
    // "left front tread depth", "tire pressure", "pads shoes", etc.)
    const speechHint = buildSpeechHintFromCommand({ section, item, note, unit });

    // If we still have no hint, use the most safe fallback (current focus)
    if (!speechHint) {
      target = {
        sectionIndex:
          preferredSectionIndex >= 0 && preferredSectionIndex < session.sections.length
            ? preferredSectionIndex
            : 0,
        itemIndex:
          preferredItemIndex >= 0 &&
          preferredSectionIndex >= 0 &&
          preferredSectionIndex < session.sections.length &&
          preferredItemIndex < (session.sections[preferredSectionIndex]?.items?.length ?? 0)
            ? preferredItemIndex
            : 0,
      };
    } else {
      target = resolveTargetFromSpeech({
        speech: speechHint,
        sections: session.sections,
        preferredSectionIndex,
        explicitSectionName: section,
      });
    }
  }

  if (!target) {
    // Don’t apply anything if we can’t confidently locate a target
    // (avoid “ghost updates” to the wrong measurement)
    // eslint-disable-next-line no-console
    console.warn("[handleTranscript] Could not resolve target:", { section, item, mode, note, value, unit });
    return;
  }

  const itemUpdates: Partial<InspectionSession["sections"][number]["items"][number]> = {};

  switch (mode) {
    case "update_status":
    case "status": {
      if (status) itemUpdates.status = status;
      break;
    }

    // measurement/value updates — this is the key for grids
    case "update_value":
    case "measurement": {
      // Tech phrases should not require “add measurement”.
      // As long as interpretCommand produces { value }, we will apply it.
      if (value !== undefined) itemUpdates.value = value;
      if (unit) itemUpdates.unit = unit;
      break;
    }

    case "add_note":
    case "add": {
      // Common tech speech: “note …”, “add note …”, “comment …”
      if (note) itemUpdates.notes = note;
      break;
    }

    case "recommend": {
      if (note) itemUpdates.recommend = [note];
      break;
    }

    case "complete_item":
    case "skip_item":
      // intentionally no-op for now (your UI auto-advance can handle)
      break;

    default:
      // If interpretCommand emits custom types later, don’t crash.
      break;
  }

  if (Object.keys(itemUpdates).length > 0) {
    updateItem(target.sectionIndex, target.itemIndex, itemUpdates);
  }
}