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

export type AppliedTarget = { sectionIndex: number; itemIndex: number };

export type HandleTranscriptResult = {
  appliedTarget: AppliedTarget | null;
};

interface HandleTranscriptArgs {
  command: ParsedCommand;
  session: InspectionSession;
  updateInspection: UpdateInspectionFn;
  updateItem: UpdateItemFn;
  updateSection: UpdateSectionFn;
  finishSession: () => void;

  /**
   * ✅ IMPORTANT:
   * The raw transcript text (after wake-word stripping),
   * so we can resolve targets even when interpretCommand
   * does not provide a usable section/item label.
   */
  rawSpeech?: string;
}

/* -------------------------------------------------------------------------------------------------
 * Resolver: turn messy tech speech into a concrete sectionIndex/itemIndex
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

const SYNONYMS: Array<{ re: RegExp; tokens: string[] }> = [
  // corners / positions
  { re: /\b(left\s*front|lf)\b/i, tokens: ["lf", "left front"] },
  { re: /\b(right\s*front|rf)\b/i, tokens: ["rf", "right front"] },
  { re: /\b(left\s*rear|lr)\b/i, tokens: ["lr", "left rear"] },
  { re: /\b(right\s*rear|rr)\b/i, tokens: ["rr", "right rear"] },

  // driver/passenger synonyms
  { re: /\b(driver\s*front)\b/i, tokens: ["lf", "left front"] },
  { re: /\b(passenger\s*front)\b/i, tokens: ["rf", "right front"] },
  { re: /\b(driver\s*rear)\b/i, tokens: ["lr", "left rear"] },
  { re: /\b(passenger\s*rear)\b/i, tokens: ["rr", "right rear"] },

  // common metrics (brakes)
  {
    re: /\b(pad|pads|shoe|shoes|lining)\b/i,
    tokens: ["pad", "pads", "shoe", "shoes", "lining"],
  },
  { re: /\b(rotor|drum)\b/i, tokens: ["rotor", "drum"] },
  { re: /\b(push\s*rod|pushrod)\b/i, tokens: ["push rod", "pushrod"] },

  // tires
  {
    re: /\b(tire\s*pressure|tyre\s*pressure|pressure)\b/i,
    tokens: ["tire pressure", "pressure"],
  },
  { re: /\b(tread\s*depth|tread)\b/i, tokens: ["tread depth", "tread"] },
  {
    re: /\b(wheel\s*torque|lug\s*torque|torque)\b/i,
    tokens: ["wheel torque", "torque"],
  },

  // air system / leak checks
  { re: /\b(leak\s*rate)\b/i, tokens: ["leak rate"] },
  {
    re: /\b(governor|gov\s*cut|cut\s*out|cut\s*in)\b/i,
    tokens: ["gov", "governor", "cut out", "cut in"],
  },

  // battery / electrical
  { re: /\b(voltage|volts|v\b)\b/i, tokens: ["voltage"] },
  { re: /\b(cca|cranking)\b/i, tokens: ["cca", "cranking"] },
  {
    re: /\b(alternator|charging|charge\s*rate)\b/i,
    tokens: ["alternator", "charging", "charge rate"],
  },
  { re: /\b(soc|state\s*of\s*charge)\b/i, tokens: ["soc", "state of charge"] },
];

const AXLE_HINTS: Array<{ re: RegExp; tokens: string[] }> = [
  {
    re: /\b(steer\s*axle|front\s*axle)\b/i,
    tokens: ["steer", "front axle", "axle 1"],
  },
  { re: /\b(drive\s*axle)\b/i, tokens: ["drive", "axle"] },
  { re: /\b(trailer\s*axle)\b/i, tokens: ["trailer", "axle"] },
  { re: /\b(axle\s*(\d+))\b/i, tokens: ["axle"] },
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

  out.push(...tokenize(raw));

  return Array.from(new Set(out.map((t) => norm(t))));
}

function scoreLabel(label: string, hintTokens: string[]): number {
  const l = norm(label);
  if (!l) return 0;

  let score = 0;

  for (const tok of hintTokens) {
    if (!tok) continue;

    // corner tokens are very valuable
    if (tok === "lf" || tok === "rf" || tok === "lr" || tok === "rr") {
      if (l.includes(tok)) score += 70;
      continue;
    }

    if (
      tok === "left front" ||
      tok === "right front" ||
      tok === "left rear" ||
      tok === "right rear"
    ) {
      if (l.includes(tok)) score += 70;
      continue;
    }

    // metric tokens
    if (
      tok === "tire pressure" ||
      tok === "tread depth" ||
      tok === "wheel torque"
    ) {
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

    if (
      tok === "pad" ||
      tok === "pads" ||
      tok === "shoe" ||
      tok === "shoes" ||
      tok === "lining"
    ) {
      if (l.includes("pad") || l.includes("shoe") || l.includes("lining"))
        score += 20;
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
      if (
        l.includes("charging") ||
        l.includes("alternator") ||
        l.includes("charge")
      )
        score += 18;
      continue;
    }

    // axle hints
    if (
      tok === "axle" ||
      tok === "steer" ||
      tok === "drive" ||
      tok === "trailer"
    ) {
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
    if (tok.length >= 4 && t.includes(tok)) score += 8;
  }

  if (t.includes("battery") && hintTokens.includes("voltage")) score += 10;
  if (
    t.includes("tire") &&
    (hintTokens.includes("tread") || hintTokens.includes("pressure"))
  )
    score += 10;
  if (t.includes("brake") && (hintTokens.includes("pad") || hintTokens.includes("rotor")))
    score += 10;

  return score;
}

function resolveTargetFromSpeech(args: {
  speech: string;
  sections: InspectionSession["sections"];
  explicitSectionName?: string;
}): Target | null {
  const { speech, sections, explicitSectionName } = args;
  if (!Array.isArray(sections) || sections.length === 0) return null;

  const hints = extractHintTokens(speech);

  const sectionOrder: number[] = [];
  for (let i = 0; i < sections.length; i++) sectionOrder.push(i);

  const explicitSection = explicitSectionName ? norm(explicitSectionName) : "";
  let best: { score: number; target: Target } | null = null;

  for (const sIdx of sectionOrder) {
    const sec = sections[sIdx];
    const secTitle = String(sec?.title ?? "");
    const items = Array.isArray(sec?.items) ? sec.items : [];

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
  }

  // minimum confidence so we don’t write into random fields
  if (!best || best.score < 20) return null;
  return best.target;
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
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

function clampTargetToSession(session: InspectionSession, t: Target): Target {
  const sIdx =
    typeof t.sectionIndex === "number" &&
    t.sectionIndex >= 0 &&
    t.sectionIndex < session.sections.length
      ? t.sectionIndex
      : 0;

  const itemsLen = session.sections[sIdx]?.items?.length ?? 0;

  const iIdx =
    typeof t.itemIndex === "number" && t.itemIndex >= 0 && t.itemIndex < itemsLen
      ? t.itemIndex
      : 0;

  return { sectionIndex: sIdx, itemIndex: iIdx };
}

/* -------------------------------------------------------------------------------------------------
 * Main apply (NO MANUAL FOCUS)
 * ------------------------------------------------------------------------------------------------- */

export async function handleTranscriptFn({
  command,
  session,
  updateInspection, // kept for signature compatibility (not used here yet)
  updateItem,
  updateSection, // kept for signature compatibility (not used here yet)
  finishSession, // kept for signature compatibility (not used here yet)
  rawSpeech,
}: HandleTranscriptArgs): Promise<HandleTranscriptResult> {
  void updateInspection;
  void updateSection;
  void finishSession;

  // Normalized fields
  let section: string | undefined;
  let item: string | undefined;
  let status: InspectionItemStatus | undefined;
  let note: string | undefined;
  let value: string | number | undefined;
  let unit: string | undefined;
  let mode: string;

  // Explicit index targets (ONLY if provided by the command itself)
  let explicitSectionIndex: number | undefined;
  let explicitItemIndex: number | undefined;

  if ("command" in command) {
    const c = command as ParsedCommandIndexed;
    mode = c.command;
    status = c.status;
    note = c.notes;
    value = c.value;
    unit = c.unit;

    if (typeof c.sectionIndex === "number") explicitSectionIndex = c.sectionIndex;
    if (typeof c.itemIndex === "number") explicitItemIndex = c.itemIndex;
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

  // 1) If the command explicitly carries indices, use them (this is NOT “manual focus”)
  if (
    typeof explicitSectionIndex === "number" &&
    typeof explicitItemIndex === "number"
  ) {
    const safe = clampTargetToSession(session, {
      sectionIndex: explicitSectionIndex,
      itemIndex: explicitItemIndex,
    });

    const itemUpdates: Partial<
      InspectionSession["sections"][number]["items"][number]
    > = {};

    switch (mode) {
      case "update_status": {
        if (status) itemUpdates.status = status;
        break;
      }
      case "update_value": {
        if (value !== undefined) itemUpdates.value = value;
        if (unit) itemUpdates.unit = unit;
        break;
      }
      case "add_note": {
        if (note) itemUpdates.notes = note;
        break;
      }
      case "recommend": {
        if (note) {
          itemUpdates.status = "recommend";
          itemUpdates.notes = note;
          itemUpdates.recommend = [note];
        }
        break;
      }
      default:
        break;
    }

    if (Object.keys(itemUpdates).length > 0) {
      updateItem(safe.sectionIndex, safe.itemIndex, itemUpdates);
      return { appliedTarget: safe };
    }

    return { appliedTarget: safe };
  }

  // 2) Try explicit name matching (fast path)
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

  let target: Target | null = null;

  if (sectionIndexByName >= 0 && itemIndexByName >= 0) {
    target = { sectionIndex: sectionIndexByName, itemIndex: itemIndexByName };
  } else {
    // 3) Resolve using RAW SPEECH first, then parsed fields (NO focus bias)
    const rawHint = String(rawSpeech ?? "").trim();
    const parsedHint = buildSpeechHintFromCommand({ section, item, note, unit });

    const hint =
      rawHint.length > 0 ? rawHint : parsedHint.length > 0 ? parsedHint : "";

    if (hint) {
      target = resolveTargetFromSpeech({
        speech: hint,
        sections: session.sections,
        explicitSectionName: section,
      });
    }
  }

  if (!target) {
    // eslint-disable-next-line no-console
    console.warn("[handleTranscript] Could not resolve target:", {
      rawSpeech,
      section,
      item,
      mode,
      note,
      value,
      unit,
    });
    return { appliedTarget: null };
  }

  const safeTarget = clampTargetToSession(session, target);

  const itemUpdates: Partial<InspectionSession["sections"][number]["items"][number]> =
    {};

  switch (mode) {
    case "update_status":
    case "status": {
      if (status) itemUpdates.status = status;
      break;
    }

    case "update_value":
    case "measurement": {
      if (value !== undefined) itemUpdates.value = value;
      if (unit) itemUpdates.unit = unit;
      break;
    }

    case "add_note":
    case "add": {
      if (note) itemUpdates.notes = note;
      break;
    }

    case "recommend": {
      if (note) {
        itemUpdates.status = "recommend";
        itemUpdates.notes = note;
        itemUpdates.recommend = [note];
      }
      break;
    }

    default:
      break;
  }

  if (Object.keys(itemUpdates).length > 0) {
    updateItem(safeTarget.sectionIndex, safeTarget.itemIndex, itemUpdates);
  }

  return { appliedTarget: safeTarget };
}