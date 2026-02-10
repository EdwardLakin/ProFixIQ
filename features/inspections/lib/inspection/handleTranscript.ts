// /features/inspections/lib/inspection/handleTranscript.ts (FULL FILE REPLACEMENT)
//
// ✅ NO MANUAL FOCUS
// - This file NEVER uses currentItemIndex.
// - For SECTION-wide actions, we may use currentSectionIndex as a SAFE fallback
//   when the model says "this/current section" or gives no usable section name.
//
// ✅ Fix goals covered
// 1) Stronger resolver for tire + air axle phrases (steer/drive/tag/trailer + #, left/right, inner/outer, rear/front)
// 2) Battery rating synonyms (“rated/rating/tested/test/cca/volts”) + battery-field mapping (cca/voltage)
// 3) Section-wide status commands work even if server returns odd shapes OR "this section"
//    - including update_status + section + no item
// 4) Unit inference from speech ("mil/mils" => "mm") + numeric coercion safety
// 5) Higher confidence threshold to reduce wrong-field writes
// 6) ✅ Pushrod travel split:
//    - "pushrod travel 2.5 inches" => allow grid targets (measurement)
//    - "pushrod travel ok" => prefer SECTION item (status, no numeric)
// 7) ✅ Don't overwrite existing measurements (unless empty)
//
// ✅ FIX (critical):
// - When server returns {command:"update_status", item:"...", status:"ok"} WITHOUT indices,
//   we now ALSO read section/item/note from the command record so target resolution works.
//
// ✅ "__auto__" section support (from local fallback commands):
// - If a command arrives with section === "__auto__", we treat it like "no explicit section".
//
// ✅ NEW: Gate items vs grids
// - If speech has NO numeric AND NO corner/axle specificity,
//   do NOT allow grid-like labels to be selected.
//   (Prevents generic “seatbelts ok / brake shoes ok / pushrod travel ok” from hitting a grid row.)
//
// ✅ NEW: Status inference
// - If status/update_status has no `status` field, infer from rawSpeech/item/note
//   so “brake shoe linings okay” marks OK.
//
// No `any`.

import {
  ParsedCommand,
  ParsedCommandIndexed,
  ParsedCommandNameBased,
  InspectionItemStatus,
  InspectionSession,
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
 * Resolver
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

/**
 * Normalize axle expressions so:
 * - "drive 2", "drive axle 2", "second drive" => tokens include "drive 2"
 * - "steer 2" => "steer 2"
 * - "trailer 1/2/3" => "trailer 1/2/3"
 * - "tag" optionally becomes "tag axle"
 */
function extractAxlePhrases(text: string): string[] {
  const t = norm(text);
  if (!t) return [];

  const out: string[] = [];

  const re = /\b(steer|drive|trailer)\s*(axle\s*)?(\d+)\b/g;
  for (const m of t.matchAll(re)) {
    const kind = m[1];
    const nStr = m[3];
    if (kind && nStr) out.push(`${kind} ${nStr}`);
  }

  const axleOnly = /\baxle\s*(\d+)\b/g;
  for (const m of t.matchAll(axleOnly)) {
    const nStr = m[1];
    if (nStr) out.push(`axle ${nStr}`);
  }

  if (/\btag\b/.test(t)) out.push("tag axle");

  return Array.from(new Set(out));
}

const SYNONYMS: Array<{ re: RegExp; tokens: string[] }> = [
  // corners / positions
  { re: /\b(left\s*front|lf)\b/i, tokens: ["lf", "left front"] },
  { re: /\b(right\s*front|rf)\b/i, tokens: ["rf", "right front"] },
  { re: /\b(left\s*rear|lr)\b/i, tokens: ["lr", "left rear"] },
  { re: /\b(right\s*rear|rr)\b/i, tokens: ["rr", "right rear"] },

  // explicit words
  { re: /\b(front)\b/i, tokens: ["front"] },
  { re: /\b(rear)\b/i, tokens: ["rear"] },

  // driver/passenger synonyms
  { re: /\b(driver\s*front)\b/i, tokens: ["lf", "left front"] },
  { re: /\b(passenger\s*front)\b/i, tokens: ["rf", "right front"] },
  { re: /\b(driver\s*rear)\b/i, tokens: ["lr", "left rear"] },
  { re: /\b(passenger\s*rear)\b/i, tokens: ["rr", "right rear"] },

  // common metrics (brakes)
  {
    re: /\b(pad|pads|shoe|shoes|lining|linings)\b/i,
    tokens: ["pad", "pads", "shoe", "shoes", "lining", "linings"],
  },
  { re: /\b(rotor|drum)\b/i, tokens: ["rotor", "drum"] },
  {
    re: /\b(push\s*rod|pushrod)\b/i,
    tokens: ["push rod", "pushrod", "pushrod travel"],
  },

  // tires
  {
    re: /\b(tire\s*pressure|tyre\s*pressure|pressure)\b/i,
    tokens: ["tire pressure", "pressure"],
  },
  { re: /\b(tread\s*depth|tread)\b/i, tokens: ["tread depth", "tread"] },
  { re: /\b(inner)\b/i, tokens: ["inner"] },
  { re: /\b(outer)\b/i, tokens: ["outer"] },
  { re: /\b(left)\b/i, tokens: ["left"] },
  { re: /\b(right)\b/i, tokens: ["right"] },

  // axle class (numbered phrases are extracted separately)
  { re: /\b(steer)\b/i, tokens: ["steer"] },
  { re: /\b(drive)\b/i, tokens: ["drive"] },
  { re: /\b(tag)\b/i, tokens: ["tag axle"] },
  { re: /\b(trailer)\b/i, tokens: ["trailer"] },

  // air system / leak checks
  { re: /\b(leak\s*rate)\b/i, tokens: ["leak rate"] },
  {
    re: /\b(governor|gov\s*cut|cut\s*out|cut\s*in)\b/i,
    tokens: ["gov", "governor", "cut out", "cut in"],
  },

  // battery / electrical
  { re: /\b(voltage|volts|v\b)\b/i, tokens: ["voltage", "v"] },
  { re: /\b(cca|cranking)\b/i, tokens: ["cca", "cranking"] },
  { re: /\b(rated|rating)\b/i, tokens: ["rated", "rating"] },
  { re: /\b(tested|test|load\s*test|loadtest)\b/i, tokens: ["tested", "test"] },
  {
    re: /\b(alternator|charging|charge\s*rate)\b/i,
    tokens: ["alternator", "charging", "charge rate"],
  },
  { re: /\b(soc|state\s*of\s*charge)\b/i, tokens: ["soc", "state of charge"] },

  // units
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

  out.push(...extractAxlePhrases(raw));
  out.push(...tokenize(raw));

  const n = norm(raw);

  if (n.includes("steer") && !/\bsteer\s*\d+\b/.test(n)) out.push("steer 1");
  if (n.includes("drive") && !/\bdrive\s*\d+\b/.test(n)) out.push("drive 1");
  if (n.includes("trailer") && !/\btrailer\s*\d+\b/.test(n)) out.push("trailer 1");

  return Array.from(new Set(out.map((t) => norm(t))));
}

function hasNumericInSpeech(speech: string): boolean {
  return /-?\d+(?:\.\d+)?/.test(norm(speech));
}

function hasCornerSpecificityInSpeech(speech: string): boolean {
  const t = norm(speech);
  if (!t) return false;

  if (/\b(lf|rf|lr|rr)\b/.test(t)) return true;
  if (/\b(left|right)\s+(front|rear)\b/.test(t)) return true;
  if (/\b(inner|outer)\b/.test(t)) return true;

  if (/\b(steer|drive|trailer)\s*\d+\b/.test(t)) return true;
  if (/\baxle\s*\d+\b/.test(t)) return true;
  if (/\btag\b/.test(t)) return true;

  return false;
}

function isGridLikeLabel(label: string): boolean {
  const l = norm(label);
  const hasSide = /\b(left|right|lf|rf|lr|rr)\b/.test(l);
  const hasAxle = /\b(steer|drive|trailer)\s+\d+\b/.test(l) || /\btag\b/.test(l);
  const hasCornerPhrase = /\b(left|right)\s+(front|rear)\b/.test(l);
  return (hasSide && hasAxle) || hasCornerPhrase || hasAxle;
}

function isPlainPushrodLabel(label: string): boolean {
  const l = norm(label);
  return (
    l === "pushrod travel" ||
    l === "push rod travel" ||
    (l.includes("push") && l.includes("rod") && l.includes("travel") && !isGridLikeLabel(label))
  );
}

function scoreLabel(args: {
  label: string;
  hintTokens: string[];
  mode: string;
  rawSpeech: string;
}): number {
  const { label, hintTokens, mode, rawSpeech } = args;
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

    if (/^(drive|steer|trailer)\s+\d+$/.test(tok)) {
      if (l.includes(tok)) score += 90;
      continue;
    }
    if (/^axle\s+\d+$/.test(tok)) {
      const nStr = tok.split(" ")[1] || "";
      if (nStr && l.includes(`axle ${nStr}`)) score += 40;
      continue;
    }

    if (tok === "steer") {
      if (l.includes("steer")) score += 40;
      continue;
    }
    if (tok === "drive") {
      if (l.includes("drive")) score += 40;
      continue;
    }
    if (tok === "trailer") {
      if (l.includes("trailer")) score += 35;
      continue;
    }
    if (tok === "tag axle") {
      if (l.includes("tag")) score += 55;
      continue;
    }

    if (tok === "front") {
      if (l.includes("front")) score += 28;
      continue;
    }
    if (tok === "rear") {
      if (l.includes("rear")) score += 35;
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
      tok === "lining" ||
      tok === "linings"
    ) {
      if (l.includes("pad") || l.includes("shoe") || l.includes("lining")) score += 22;
      continue;
    }
    if (tok === "rotor" || tok === "drum") {
      if (l.includes("rotor") || l.includes("drum")) score += 22;
      continue;
    }
    if (tok === "push rod" || tok === "pushrod" || tok === "pushrod travel") {
      if (l.includes("push rod") || l.includes("pushrod")) score += 26;
      if (l.includes("travel")) score += 10;
      continue;
    }

    if (tok === "cca" || tok === "cranking") {
      if (l.includes("cca") || l.includes("cranking")) score += 22;
      continue;
    }
    if (tok === "rated" || tok === "rating") {
      if (l.includes("rated") || l.includes("rating")) score += 30;
      continue;
    }
    if (tok === "tested" || tok === "test") {
      if (l.includes("tested") || l.includes("test")) score += 30;
      continue;
    }
    if (tok === "voltage" || tok === "v") {
      if (l.includes("voltage") || /\bv\b/.test(l)) score += 22;
      continue;
    }

    if (tok === "psi" && l.includes("psi")) score += 14;
    if (tok === "mm" && l.includes("mm")) score += 14;
    if (tok === "in" && (l.includes(" in") || l.endsWith(" in"))) score += 14;

    if (tok.length >= 3 && l.includes(tok)) score += 3;
  }

  // ✅ Pushrod travel split rule
  const speechN = norm(rawSpeech);
  const mentionsPushrod =
    speechN.includes("pushrod") || (speechN.includes("push") && speechN.includes("rod"));
  const numeric = hasNumericInSpeech(rawSpeech);

  if (mentionsPushrod && (mode === "status" || mode === "update_status")) {
    if (!numeric) {
      if (isPlainPushrodLabel(label)) score += 140;
      if (isGridLikeLabel(label)) score -= 90;
    }
  }

  if (mentionsPushrod && (mode === "measurement" || mode === "update_value")) {
    if (numeric) {
      if (isGridLikeLabel(label)) score += 60;
      if (isPlainPushrodLabel(label)) score -= 25;
    }
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

  const wantsBattery =
    hintTokens.includes("cca") ||
    hintTokens.includes("cranking") ||
    hintTokens.includes("voltage") ||
    hintTokens.includes("soc");

  const wantsTire =
    hintTokens.includes("tread") ||
    hintTokens.includes("pressure") ||
    hintTokens.includes("tire pressure") ||
    hintTokens.includes("tread depth") ||
    hintTokens.includes("inner") ||
    hintTokens.includes("outer");

  const wantsBrake =
    hintTokens.includes("pad") ||
    hintTokens.includes("rotor") ||
    hintTokens.includes("drum") ||
    hintTokens.includes("pushrod") ||
    hintTokens.includes("push rod") ||
    hintTokens.includes("pushrod travel");

  if (t.includes("battery") && wantsBattery) score += 20;
  if (t.includes("tire") && wantsTire) score += 20;
  if (t.includes("brake") && wantsBrake) score += 20;

  const wantsAxle =
    hintTokens.some((x) => /^(drive|steer|trailer)\s+\d+$/.test(x)) ||
    hintTokens.includes("tag axle") ||
    hintTokens.includes("drive") ||
    hintTokens.includes("steer") ||
    hintTokens.includes("trailer");

  if (wantsAxle && (t.includes("tire") || t.includes("brake") || t.includes("corner"))) score += 8;

  return score;
}

function resolveTargetFromSpeech(args: {
  speech: string;
  sections: InspectionSession["sections"];
  explicitSectionName?: string;
  mode: string;
}): Target | null {
  const { speech, sections, explicitSectionName, mode } = args;
  if (!Array.isArray(sections) || sections.length === 0) return null;

  const hints = extractHintTokens(speech);
  const explicitSection = explicitSectionName ? norm(explicitSectionName) : "";

  // ✅ Gate grids when speech is generic (no numeric + no corner/axle specificity)
  const numeric = hasNumericInSpeech(speech);
  const specific = hasCornerSpecificityInSpeech(speech);
  const gateOutGridLabels = !numeric && !specific;

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

      if (gateOutGridLabels && isGridLikeLabel(label)) continue;

      const ls = scoreLabel({ label, hintTokens: hints, mode, rawSpeech: speech });
      const total = ls + secScore;

      if (total <= 0) continue;

      if (!best || total > best.score) {
        best = { score: total, target: { sectionIndex: sIdx, itemIndex: iIdx } };
      }
    }
  }

  if (!best || best.score < 30) return null;
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
    typeof t.itemIndex === "number" &&
    t.itemIndex >= 0 &&
    t.itemIndex < itemsLen
      ? t.itemIndex
      : 0;

  return { sectionIndex: sIdx, itemIndex: iIdx };
}

function resolveSectionIndexByName(session: InspectionSession, sectionName: string): number {
  const needle = norm(sectionName);
  if (!needle) return -1;

  return session.sections.findIndex((sec) => norm(String(sec.title ?? "")).includes(needle));
}

function normalizeStatusMaybe(raw: unknown): InspectionItemStatus | undefined {
  const s = String(raw ?? "").toLowerCase().trim();
  if (s === "ok" || s === "fail" || s === "na" || s === "recommend") return s as InspectionItemStatus;
  if (s === "n/a" || s === "n a") return "na";
  if (s === "okay" || s === "pass") return "ok";
  if (s === "rec") return "recommend";
  return undefined;
}

function inferStatusFromText(text: string): InspectionItemStatus | undefined {
  const t = norm(text);
  if (!t) return undefined;

  // explicit first
  const direct = normalizeStatusMaybe(t);
  if (direct) return direct;

  if (/\b(ok|okay|pass|passed|good)\b/.test(t)) return "ok";
  if (/\b(fail|failed|bad)\b/.test(t)) return "fail";
  if (/\b(n\/?a|not\s*applicable)\b/.test(t)) return "na";
  if (/\b(recommend|recommended|rec)\b/.test(t)) return "recommend";

  return undefined;
}

function stripStatusWords(text: string): string {
  const t = norm(text);
  if (!t) return "";
  return t
    .replace(/\b(ok|okay|pass|passed|good)\b/g, " ")
    .replace(/\b(fail|failed|bad)\b/g, " ")
    .replace(/\b(n\/?a|not\s*applicable)\b/g, " ")
    .replace(/\b(recommend|recommended|rec)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function coerceNumericValue(raw: unknown): number | undefined {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : undefined;
  const s = String(raw ?? "").trim();
  if (!s) return undefined;
  const m = s.match(/-?\d+(?:\.\d+)?/);
  if (!m) return undefined;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : undefined;
}

function inferUnitFromSpeech(speech: string): string | undefined {
  const t = norm(speech);
  if (!t) return undefined;

  if (/\bpsi\b/.test(t)) return "psi";
  if (/\b(volts?|v)\b/.test(t)) return "V";
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
      typeof qtyRaw === "number" ? qtyRaw : Number.isFinite(Number(qtyRaw)) ? Number(qtyRaw) : 1;

    if (!description) continue;
    out.push({ description, qty: qty > 0 ? qty : 1 });
  }

  return out.length ? out : undefined;
}

function coerceLaborHoursFromUnknown(v: unknown): number | null | undefined {
  if (v === null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/* ------------------- section-name normalization + fallback ------------------- */

function isThisSectionName(sectionName: string | undefined): boolean {
  const s = norm(sectionName ?? "");
  if (!s) return true;
  return (
    s === "this" ||
    s === "current" ||
    s === "here" ||
    s === "section" ||
    s.includes("this section") ||
    s.includes("current section")
  );
}

function getSafeCurrentSectionIndex(session: InspectionSession): number {
  const idx = typeof session.currentSectionIndex === "number" ? session.currentSectionIndex : 0;
  if (idx < 0) return 0;
  if (idx >= session.sections.length) return Math.max(0, session.sections.length - 1);
  return idx;
}

function isBatteryLikeLabel(label: string): boolean {
  const l = norm(label);
  return (
    l.includes("battery") ||
    l.includes("cca") ||
    l.includes("cranking") ||
    l.includes("voltage") ||
    l.includes("state of charge") ||
    l === "soc"
  );
}

function hasExistingMeasurement(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "number") return Number.isFinite(v);
  const s = String(v).trim();
  return s.length > 0;
}

function findItemIndexByNamePreferNonGrid(params: {
  items: InspectionSession["sections"][number]["items"];
  needle: string;
  gateOutGridLabels: boolean;
}): number {
  const { items, needle, gateOutGridLabels } = params;
  const n = norm(needle);
  if (!n) return -1;

  // pass 1: prefer non-grid if gated
  if (gateOutGridLabels) {
    const idx = items.findIndex((it) => {
      const label = String(it.name ?? it.item ?? "");
      return norm(label).includes(n) && !isGridLikeLabel(label);
    });
    if (idx >= 0) return idx;
  }

  // pass 2: any match
  return items.findIndex((it) => norm(String(it.name ?? it.item ?? "")).includes(n));
}

/* -------------------------------------------------------------------------------------------------
 * Main apply
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

    status = normalizeStatusMaybe((c as unknown as { status?: unknown })?.status);
    value = (c as unknown as { value?: unknown })?.value as unknown as string | number | undefined;
    unit = (c as unknown as { unit?: unknown })?.unit as unknown as string | undefined;

    if (typeof (c as unknown as { sectionIndex?: unknown })?.sectionIndex === "number") {
      explicitSectionIndex = (c as unknown as { sectionIndex: number }).sectionIndex;
    }
    if (typeof (c as unknown as { itemIndex?: unknown })?.itemIndex === "number") {
      explicitItemIndex = (c as unknown as { itemIndex: number }).itemIndex;
    }

    const rec = c as unknown;
    if (isRecord(rec)) {
      if (!section && typeof rec.section === "string") section = rec.section;
      if (!item && typeof rec.item === "string") item = rec.item;

      const noteCandidate =
        (typeof rec.note === "string" && rec.note) ||
        (typeof rec.notes === "string" && rec.notes) ||
        "";
      if (!note && noteCandidate) note = noteCandidate;

      parts = coercePartsFromUnknown(rec.parts);
      laborHours = coerceLaborHoursFromUnknown(rec.laborHours);
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

  if (section && norm(section) === "__auto__") section = undefined;

  const inferredUnit = rawSpeech ? inferUnitFromSpeech(rawSpeech) : undefined;
  if (!unit && inferredUnit) unit = inferredUnit;

  const n = coerceNumericValue(value);
  if (n !== undefined) value = n;

  const numericInSpeech = rawSpeech ? hasNumericInSpeech(rawSpeech) : false;
  const cornerSpecific = rawSpeech ? hasCornerSpecificityInSpeech(rawSpeech) : false;
  const gateOutGridLabels = !numericInSpeech && !cornerSpecific;

  // ✅ If status wasn't provided, infer it from speech/item/note (fixes “brake shoe linings okay”)
  const isStatusMode = mode === "status" || mode === "update_status";
  if (isStatusMode && !status) {
    const fromSpeech = rawSpeech ? inferStatusFromText(rawSpeech) : undefined;
    const fromItem = item ? inferStatusFromText(item) : undefined;
    const fromNote = note ? inferStatusFromText(note) : undefined;
    status = fromSpeech ?? fromItem ?? fromNote;
  }

  // ✅ If item contains status words, strip them for matching/resolution
  const cleanedItem = item ? stripStatusWords(item) : "";
  if (cleanedItem && cleanedItem !== norm(item ?? "")) {
    item = cleanedItem;
  }

  const isSectionWide =
    mode === "section_status" ||
    mode === "mark_section" ||
    mode === "set_section_status" ||
    (mode === "update_status" && !!section && !item);

  if (isSectionWide) {
    const currentIdx = getSafeCurrentSectionIndex(session);

    const sIdx =
      typeof explicitSectionIndex === "number"
        ? clampTargetToSession(session, { sectionIndex: explicitSectionIndex, itemIndex: 0 }).sectionIndex
        : isThisSectionName(section)
          ? currentIdx
          : section
            ? (() => {
                const byName = resolveSectionIndexByName(session, section);
                return byName >= 0 ? byName : currentIdx;
              })()
            : currentIdx;

    const st = status ?? normalizeStatusMaybe((command as unknown as Record<string, unknown>)?.status);
    if (!st) return null;

    const itemsLen = session.sections[sIdx]?.items?.length ?? 0;
    for (let i = 0; i < itemsLen; i++) updateItem(sIdx, i, { status: st });

    return itemsLen > 0 ? { sectionIndex: sIdx, itemIndex: 0 } : null;
  }

  // Direct index apply (trust indices)
  if (typeof explicitSectionIndex === "number" && typeof explicitItemIndex === "number") {
    const safe = clampTargetToSession(session, {
      sectionIndex: explicitSectionIndex,
      itemIndex: explicitItemIndex,
    });

    const itemUpdates: Partial<InspectionSession["sections"][number]["items"][number]> = {};
    const targetRow =
      session.sections[safe.sectionIndex]?.items?.[safe.itemIndex] ?? ({} as Record<string, unknown>);
    const targetLabel = String(
      (targetRow as { item?: unknown; name?: unknown }).item ??
        (targetRow as { name?: unknown }).name ??
        "",
    );

    switch (mode) {
      case "update_status":
      case "status":
        if (status) itemUpdates.status = status;
        break;

      case "update_value":
      case "measurement": {
        const existing = (targetRow as { value?: unknown }).value;
        if (value !== undefined && !hasExistingMeasurement(existing)) {
          if (isBatteryLikeLabel(targetLabel)) {
            if ((unit ?? "").toUpperCase() === "CCA") (itemUpdates as Record<string, unknown>).cca = value;
            else if ((unit ?? "").toUpperCase() === "V") (itemUpdates as Record<string, unknown>).voltage = value;
            itemUpdates.value = value;
          } else {
            itemUpdates.value = value;
          }
        }
        if (unit) itemUpdates.unit = unit;
        break;
      }

      case "add_note":
      case "add":
        if (note) itemUpdates.notes = note;
        break;

      case "recommend":
        if (note) {
          itemUpdates.status = "recommend";
          itemUpdates.notes = note;
          itemUpdates.recommend = [note];
        }
        break;

      default:
        break;
    }

    if (parts) itemUpdates.parts = parts;
    if (laborHours !== undefined) itemUpdates.laborHours = laborHours;

    if (Object.keys(itemUpdates).length > 0) updateItem(safe.sectionIndex, safe.itemIndex, itemUpdates);

    return Object.keys(itemUpdates).length > 0 ? safe : null;
  }

  const currentSectionIndex = getSafeCurrentSectionIndex(session);

  const sectionIndexByName =
    section && section.trim().length > 0 && !isThisSectionName(section)
      ? session.sections.findIndex((sec) =>
          String(sec.title ?? "").toLowerCase().includes(section.toLowerCase()),
        )
      : -1;

  // ✅ Name resolution with grid gate
  const itemIndexByName =
    sectionIndexByName >= 0 && item && item.trim().length > 0
      ? findItemIndexByNamePreferNonGrid({
          items: session.sections[sectionIndexByName].items,
          needle: item,
          gateOutGridLabels: gateOutGridLabels && isStatusMode,
        })
      : -1;

  const itemIndexInCurrent =
    item && item.trim().length > 0
      ? findItemIndexByNamePreferNonGrid({
          items: session.sections[currentSectionIndex]?.items ?? [],
          needle: item,
          gateOutGridLabels: gateOutGridLabels && isStatusMode,
        })
      : -1;

  let target: Target | null = null;

  if (sectionIndexByName >= 0 && itemIndexByName >= 0) {
    target = { sectionIndex: sectionIndexByName, itemIndex: itemIndexByName };
  } else if (itemIndexInCurrent >= 0) {
    target = { sectionIndex: currentSectionIndex, itemIndex: itemIndexInCurrent };
  } else {
    const explicitSectionName =
      section && !isThisSectionName(section) && resolveSectionIndexByName(session, section) >= 0
        ? section
        : undefined;

    const rawHint = String(rawSpeech ?? "").trim();

    const parsedHint = buildSpeechHintFromCommand({
      section,
      item: item ? stripStatusWords(item) : undefined,
      note,
      unit,
    });

    const hint = rawHint.length > 0 ? rawHint : parsedHint.length > 0 ? parsedHint : "";

    if (hint) {
      target = resolveTargetFromSpeech({
        speech: hint,
        sections: session.sections,
        explicitSectionName,
        mode,
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

  const itemUpdates: Partial<InspectionSession["sections"][number]["items"][number]> = {};
  const targetRow =
    session.sections[safeTarget.sectionIndex]?.items?.[safeTarget.itemIndex] ??
    ({} as Record<string, unknown>);
  const targetLabel = String(
    (targetRow as { item?: unknown; name?: unknown }).item ??
      (targetRow as { name?: unknown }).name ??
      "",
  );

  switch (mode) {
    case "update_status":
    case "status":
      if (status) itemUpdates.status = status;
      break;

    case "update_value":
    case "measurement": {
      const existing = (targetRow as { value?: unknown }).value;
      if (value !== undefined && !hasExistingMeasurement(existing)) {
        if (isBatteryLikeLabel(targetLabel)) {
          if ((unit ?? "").toUpperCase() === "CCA") (itemUpdates as Record<string, unknown>).cca = value;
          else if ((unit ?? "").toUpperCase() === "V") (itemUpdates as Record<string, unknown>).voltage = value;
          itemUpdates.value = value;
        } else {
          itemUpdates.value = value;
        }
      }
      if (unit) itemUpdates.unit = unit;
      break;
    }

    case "add_note":
    case "add":
      if (note) itemUpdates.notes = note;
      break;

    case "recommend":
      if (note) {
        itemUpdates.status = "recommend";
        itemUpdates.notes = note;
        itemUpdates.recommend = [note];
      }
      break;

    default:
      break;
  }

  if (parts) itemUpdates.parts = parts;
  if (laborHours !== undefined) itemUpdates.laborHours = laborHours;

  if (Object.keys(itemUpdates).length > 0) {
    updateItem(safeTarget.sectionIndex, safeTarget.itemIndex, itemUpdates);
    return safeTarget;
  }

  return null;
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