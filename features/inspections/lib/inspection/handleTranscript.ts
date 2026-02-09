// /features/inspections/lib/inspection/handleTranscript.ts (FULL FILE REPLACEMENT)
// ✅ Patched for:
// 1) Section-wide commands work with "this/current section" and missing section names
// 2) Name-based commands can fall back to CURRENT SECTION when section name mismatch
// 3) Keeps your improved resolver + no `any`

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
  command: ParsedCommand | ParsedCommand[];
  session: InspectionSession;
  updateInspection: UpdateInspectionFn;
  updateItem: UpdateItemFn;
  updateSection: UpdateSectionFn;
  finishSession: () => void;
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
  { re: /\b(left\s*front|lf)\b/i, tokens: ["lf", "left front"] },
  { re: /\b(right\s*front|rf)\b/i, tokens: ["rf", "right front"] },
  { re: /\b(left\s*rear|lr)\b/i, tokens: ["lr", "left rear"] },
  { re: /\b(right\s*rear|rr)\b/i, tokens: ["rr", "right rear"] },

  { re: /\b(driver\s*front)\b/i, tokens: ["lf", "left front"] },
  { re: /\b(passenger\s*front)\b/i, tokens: ["rf", "right front"] },
  { re: /\b(driver\s*rear)\b/i, tokens: ["lr", "left rear"] },
  { re: /\b(passenger\s*rear)\b/i, tokens: ["rr", "right rear"] },

  {
    re: /\b(pad|pads|shoe|shoes|lining)\b/i,
    tokens: ["pad", "pads", "shoe", "shoes", "lining"],
  },
  { re: /\b(rotor|drum)\b/i, tokens: ["rotor", "drum"] },
  { re: /\b(push\s*rod|pushrod)\b/i, tokens: ["push rod", "pushrod"] },

  {
    re: /\b(tire\s*pressure|tyre\s*pressure|pressure)\b/i,
    tokens: ["tire pressure", "pressure"],
  },
  { re: /\b(tread\s*depth|tread)\b/i, tokens: ["tread depth", "tread"] },
  { re: /\b(inner)\b/i, tokens: ["inner"] },
  { re: /\b(outer)\b/i, tokens: ["outer"] },
  { re: /\b(left)\b/i, tokens: ["left"] },
  { re: /\b(right)\b/i, tokens: ["right"] },

  { re: /\b(steer)\b/i, tokens: ["steer", "steer 1", "axle 1"] },
  { re: /\b(drive)\b/i, tokens: ["drive", "drive 1"] },
  { re: /\b(tag)\b/i, tokens: ["tag"] },
  { re: /\b(trailer)\b/i, tokens: ["trailer"] },
  { re: /\b(axle\s*(\d+))\b/i, tokens: ["axle"] },

  { re: /\b(leak\s*rate)\b/i, tokens: ["leak rate"] },
  {
    re: /\b(governor|gov\s*cut|cut\s*out|cut\s*in)\b/i,
    tokens: ["gov", "governor", "cut out", "cut in"],
  },

  { re: /\b(voltage|volts|v\b)\b/i, tokens: ["voltage"] },
  { re: /\b(cca|cranking)\b/i, tokens: ["cca", "cranking"] },
  { re: /\b(rated|rating)\b/i, tokens: ["rated", "rating"] },
  { re: /\b(tested|test)\b/i, tokens: ["tested", "test"] },
  {
    re: /\b(alternator|charging|charge\s*rate)\b/i,
    tokens: ["alternator", "charging", "charge rate"],
  },
  { re: /\b(soc|state\s*of\s*charge)\b/i, tokens: ["soc", "state of charge"] },

  { re: /\b(mil|mils)\b/i, tokens: ["mil"] },
  { re: /\b(mm|millimeter|millimetre)\b/i, tokens: ["mm"] },
  { re: /\b(psi)\b/i, tokens: ["psi"] },
  { re: /\b(inch|inches|in)\b/i, tokens: ["in"] },
];

function extractHintTokens(text: string): string[] {
  const raw = text || "";
  const out: string[] = [];

  for (const m of SYNONYMS) {
    if (m.re.test(raw)) out.push(...m.tokens);
  }

  out.push(...tokenize(raw));

  const n = norm(raw);
  if (n.includes("steer") && !n.includes("steer 1")) out.push("steer 1");
  if (n.includes("drive") && !n.includes("drive 1")) out.push("drive 1");

  return Array.from(new Set(out.map((t) => norm(t))));
}

function scoreLabel(label: string, hintTokens: string[]): number {
  const l = norm(label);
  if (!l) return 0;

  let score = 0;

  for (const tok of hintTokens) {
    if (!tok) continue;

    if (tok === "lf" || tok === "rf" || tok === "lr" || tok === "rr") {
      if (l.includes(tok)) score += 80;
      continue;
    }
    if (
      tok === "left front" ||
      tok === "right front" ||
      tok === "left rear" ||
      tok === "right rear"
    ) {
      if (l.includes(tok)) score += 80;
      continue;
    }

    if (tok === "steer" || tok === "steer 1") {
      if (l.includes("steer")) score += 40;
      continue;
    }
    if (tok === "drive" || tok === "drive 1") {
      if (l.includes("drive")) score += 40;
      continue;
    }
    if (tok === "left" || tok === "right") {
      if (l.includes(tok)) score += 22;
      continue;
    }
    if (tok === "inner" || tok === "outer") {
      if (l.includes(tok)) score += 22;
      continue;
    }

    if (tok === "tire pressure" || tok === "pressure") {
      if (l.includes("pressure")) score += tok === "tire pressure" ? 35 : 22;
      continue;
    }
    if (tok === "tread depth" || tok === "tread") {
      if (l.includes("tread")) score += tok === "tread depth" ? 35 : 22;
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
        score += 22;
      continue;
    }
    if (tok === "rotor" || tok === "drum") {
      if (l.includes("rotor") || l.includes("drum")) score += 22;
      continue;
    }
    if (tok === "push rod" || tok === "pushrod") {
      if (l.includes("push rod") || l.includes("pushrod")) score += 22;
      continue;
    }

    if (tok === "cca" || tok === "cranking") {
      if (l.includes("cca") || l.includes("cranking")) score += 22;
      continue;
    }
    if (tok === "rated" || tok === "rating") {
      if (l.includes("rated")) score += 30;
      continue;
    }
    if (tok === "tested" || tok === "test") {
      if (l.includes("tested")) score += 30;
      continue;
    }

    if (tok === "psi" && l.includes("psi")) score += 14;
    if (tok === "mm" && l.includes("mm")) score += 14;
    if (tok === "in" && (l.includes(" in") || l.endsWith(" in"))) score += 14;

    if (tok.length >= 3 && l.includes(tok)) score += 3;
  }

  const wantsSteer = hintTokens.includes("steer") || hintTokens.includes("steer 1");
  const wantsDrive = hintTokens.includes("drive") || hintTokens.includes("drive 1");
  const wantsLeft = hintTokens.includes("left");
  const wantsRight = hintTokens.includes("right");

  if ((wantsSteer && l.includes("steer")) || (wantsDrive && l.includes("drive")))
    score += 10;
  if ((wantsLeft && l.includes("left")) || (wantsRight && l.includes("right")))
    score += 10;

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

  const wantsBattery =
    hintTokens.includes("cca") ||
    hintTokens.includes("cranking") ||
    hintTokens.includes("voltage");
  const wantsTire =
    hintTokens.includes("tread") ||
    hintTokens.includes("pressure") ||
    hintTokens.includes("tire pressure") ||
    hintTokens.includes("tread depth");
  const wantsBrake =
    hintTokens.includes("pad") ||
    hintTokens.includes("rotor") ||
    hintTokens.includes("drum") ||
    hintTokens.includes("pushrod");

  if (t.includes("battery") && wantsBattery) score += 20;
  if (t.includes("tire") && wantsTire) score += 20;
  if (t.includes("brake") && wantsBrake) score += 20;

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
  const explicitSection = explicitSectionName ? norm(explicitSectionName) : "";

  let best: { score: number; target: Target } | null = null;

  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
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

  if (!best || best.score < 28) return null;
  return best.target;
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

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

function normalizeStatusMaybe(raw: unknown): InspectionItemStatus | undefined {
  const s = String(raw ?? "").toLowerCase().trim();
  if (s === "ok" || s === "fail" || s === "na" || s === "recommend") {
    return s as InspectionItemStatus;
  }
  if (s === "n/a" || s === "n a") return "na";
  if (s === "okay" || s === "pass") return "ok";
  if (s === "rec") return "recommend";
  return undefined;
}

function coerceNumericValue(raw: unknown): number | undefined {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : undefined;
  const s = String(raw ?? "").trim();
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function inferUnitFromSpeech(speech: string): string | undefined {
  const t = norm(speech);
  if (!t) return undefined;

  if (/\bpsi\b/.test(t)) return "psi";
  if (/\b(inch|inches|\bin\b)\b/.test(t)) return "in";
  if (/\b(mm|millimeter|millimetre)\b/.test(t)) return "mm";
  if (/\b(mil|mils)\b/.test(t)) return "mm";
  if (/\bcca\b/.test(t)) return "CCA";
  return undefined;
}

type PartLine = { description: string; qty: number };

function coercePartsFromUnknown(v: unknown): PartLine[] | undefined {
  if (!Array.isArray(v)) return undefined;

  const out: PartLine[] = [];
  for (const row of v) {
    if (!isRecord(row)) continue;
    const description = String(row.description ?? "").trim();
    const qtyRaw = row.qty;
    const qty =
      typeof qtyRaw === "number"
        ? qtyRaw
        : Number.isFinite(Number(qtyRaw))
          ? Number(qtyRaw)
          : 1;

    if (!description) continue;
    out.push({ description, qty: qty > 0 ? qty : 1 });
  }

  return out.length > 0 ? out : undefined;
}

function coerceLaborHoursFromUnknown(v: unknown): number | null | undefined {
  if (v === null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;

  const n = Number(v);
  if (Number.isFinite(n)) return n;

  return undefined;
}

function normalizeSectionNameForThis(sectionName: string): "this" | "named" {
  const s = norm(sectionName);
  if (!s) return "this";
  if (s === "this" || s === "current" || s === "here" || s === "section") return "this";
  if (s.includes("this section") || s.includes("current section")) return "this";
  return "named";
}

function resolveSectionIndexByNameOrCurrent(args: {
  session: InspectionSession;
  sectionName?: string;
  fallbackSectionIndex: number;
}): number {
  const { session, sectionName, fallbackSectionIndex } = args;

  const fb = clampTargetToSession(session, {
    sectionIndex: fallbackSectionIndex,
    itemIndex: 0,
  }).sectionIndex;

  const nameRaw = String(sectionName ?? "").trim();
  const mode = normalizeSectionNameForThis(nameRaw);
  if (mode === "this") return fb;

  const needle = norm(nameRaw);
  const idx = session.sections.findIndex((sec) =>
    norm(String(sec.title ?? "")).includes(needle),
  );

  return idx >= 0 ? idx : fb; // ✅ fallback to current if name mismatch
}

/* -------------------------------------------------------------------------------------------------
 * Main apply (NO MANUAL FOCUS)
 * ------------------------------------------------------------------------------------------------- */

async function applySingleCommand(args: {
  command: ParsedCommand;
  session: InspectionSession;
  updateItem: UpdateItemFn;
  rawSpeech?: string;
}): Promise<AppliedTarget | null> {
  const { command, session, updateItem, rawSpeech } = args;

  let section: string | undefined;
  let item: string | undefined;
  let status: InspectionItemStatus | undefined;
  let note: string | undefined;
  let value: string | number | undefined;
  let unit: string | undefined;
  let mode: string;

  let parts: PartLine[] | undefined;
  let laborHours: number | null | undefined;

  let explicitSectionIndex: number | undefined;
  let explicitItemIndex: number | undefined;

  if ("command" in command) {
    const c = command as ParsedCommandIndexed;
    mode = c.command;

    status = normalizeStatusMaybe(c.status);
    note = c.notes;
    value = c.value;
    unit = c.unit;

    if (typeof c.sectionIndex === "number") explicitSectionIndex = c.sectionIndex;
    if (typeof c.itemIndex === "number") explicitItemIndex = c.itemIndex;

    const rec = c as unknown;
    if (isRecord(rec)) {
      parts = coercePartsFromUnknown(rec.parts);
      laborHours = coerceLaborHoursFromUnknown(rec.laborHours ?? rec.laborHours);
    }
  } else {
    const c = command as ParsedCommandNameBased;
    mode = c.type;

    section = c.section;
    item = c.item;

    if ("status" in c) status = normalizeStatusMaybe(c.status);
    if ("note" in c) note = c.note;
    if ("value" in c) value = c.value;
    if ("unit" in c) unit = c.unit;

    const rec = c as unknown;
    if (isRecord(rec)) {
      parts = coercePartsFromUnknown(rec.parts);
      laborHours = coerceLaborHoursFromUnknown(rec.laborHours);
    }
  }

  const inferredUnit = rawSpeech ? inferUnitFromSpeech(rawSpeech) : undefined;
  if (!unit && inferredUnit) unit = inferredUnit;

  const n = coerceNumericValue(value);
  if (n !== undefined) value = n;

  const currentSectionFallback =
    typeof session.currentSectionIndex === "number"
      ? session.currentSectionIndex
      : 0;

  /**
   * ✅ SECTION-WIDE STATUS (NOW SUPPORTS "THIS/CURRENT" + FALLBACK)
   */
  if (
    mode === "section_status" ||
    mode === "mark_section" ||
    mode === "set_section_status"
  ) {
    const sIdx =
      typeof explicitSectionIndex === "number"
        ? clampTargetToSession(session, {
            sectionIndex: explicitSectionIndex,
            itemIndex: 0,
          }).sectionIndex
        : resolveSectionIndexByNameOrCurrent({
            session,
            sectionName: section,
            fallbackSectionIndex: currentSectionFallback,
          });

    const st =
      status ??
      normalizeStatusMaybe((command as unknown as Record<string, unknown>)?.status);

    if (!st) return null;

    const itemsLen = session.sections[sIdx]?.items?.length ?? 0;
    for (let i = 0; i < itemsLen; i++) {
      updateItem(sIdx, i, { status: st });
    }

    return itemsLen > 0 ? { sectionIndex: sIdx, itemIndex: 0 } : null;
  }

  // 1) Explicit indices
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

    if (parts) itemUpdates.parts = parts;
    if (laborHours !== undefined) itemUpdates.laborHours = laborHours;

    if (Object.keys(itemUpdates).length > 0) {
      updateItem(safe.sectionIndex, safe.itemIndex, itemUpdates);
    }

    return safe;
  }

  // 2) Name matching (with CURRENT SECTION fallback)
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

  // ✅ If section didn't match, try item match in CURRENT SECTION
  let fallbackItemIndexInCurrent = -1;
  if (item && item.trim().length > 0) {
    const cs = clampTargetToSession(session, {
      sectionIndex: currentSectionFallback,
      itemIndex: 0,
    }).sectionIndex;

    fallbackItemIndexInCurrent = session.sections[cs]?.items?.findIndex((it) =>
      String(it.name ?? it.item ?? "")
        .toLowerCase()
        .includes(item.toLowerCase()),
    );
  }

  let target: Target | null = null;

  if (sectionIndexByName >= 0 && itemIndexByName >= 0) {
    target = { sectionIndex: sectionIndexByName, itemIndex: itemIndexByName };
  } else if (fallbackItemIndexInCurrent >= 0) {
    const cs = clampTargetToSession(session, {
      sectionIndex: currentSectionFallback,
      itemIndex: 0,
    }).sectionIndex;
    target = { sectionIndex: cs, itemIndex: fallbackItemIndexInCurrent };
  } else {
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
    return null;
  }

  const safeTarget = clampTargetToSession(session, target);

  const itemUpdates: Partial<
    InspectionSession["sections"][number]["items"][number]
  > = {};

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

  if (parts) itemUpdates.parts = parts;
  if (laborHours !== undefined) itemUpdates.laborHours = laborHours;

  if (Object.keys(itemUpdates).length > 0) {
    updateItem(safeTarget.sectionIndex, safeTarget.itemIndex, itemUpdates);
  }

  return safeTarget;
}

export async function handleTranscriptFn({
  command,
  session,
  updateInspection,
  updateItem,
  updateSection,
  finishSession,
  rawSpeech,
}: HandleTranscriptArgs): Promise<HandleTranscriptResult> {
  void updateInspection;
  void updateSection;
  void finishSession;

  const commands = Array.isArray(command) ? command : [command];

  let lastApplied: AppliedTarget | null = null;

  for (const cmd of commands) {
    // eslint-disable-next-line no-await-in-loop
    const applied = await applySingleCommand({
      command: cmd,
      session,
      updateItem,
      rawSpeech,
    });

    if (applied) lastApplied = applied;
  }

  return { appliedTarget: lastApplied };
}