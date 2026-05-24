import {
  ParsedCommand,
  ParsedCommandIndexed,
  ParsedCommandNameBased,
  ParsedInspectionFindingCommand,
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

type Target = { sectionIndex: number; itemIndex: number };
type PartLine = { description: string; qty: number };

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
  { re: /\b(left\s*front|lf)\b/i, tokens: ["lf", "left front"] },
  { re: /\b(right\s*front|rf)\b/i, tokens: ["rf", "right front"] },
  { re: /\b(left\s*rear|lr)\b/i, tokens: ["lr", "left rear"] },
  { re: /\b(right\s*rear|rr)\b/i, tokens: ["rr", "right rear"] },

  { re: /\b(front)\b/i, tokens: ["front"] },
  { re: /\b(rear)\b/i, tokens: ["rear"] },

  { re: /\b(driver\s*front)\b/i, tokens: ["lf", "left front"] },
  { re: /\b(passenger\s*front)\b/i, tokens: ["rf", "right front"] },
  { re: /\b(driver\s*rear)\b/i, tokens: ["lr", "left rear"] },
  { re: /\b(passenger\s*rear)\b/i, tokens: ["rr", "right rear"] },

  {
    re: /\b(pad|pads|shoe|shoes|lining|linings)\b/i,
    tokens: ["pad", "pads", "shoe", "shoes", "lining", "linings"],
  },
  { re: /\b(rotor|drum)\b/i, tokens: ["rotor", "drum"] },
  {
    re: /\b(push\s*rod|pushrod)\b/i,
    tokens: ["push rod", "pushrod", "pushrod travel"],
  },
  {
    re: /\b(slack\s*adjuster|slack\s*adjusters?)\b/i,
    tokens: ["slack", "adjuster", "slack adjuster"],
  },
  {
    re: /\b(brake\s*chamber|brake\s*chambers?)\b/i,
    tokens: ["brake chamber", "chamber"],
  },
  {
    re: /\b(brake\s*line|brake\s*lines|hose|hoses)\b/i,
    tokens: ["brake line", "line", "hose"],
  },
  {
    re: /\b(air\s*tank|air\s*tanks)\b/i,
    tokens: ["air tank", "tank"],
  },

  {
    re: /\b(tire\s*pressure|tyre\s*pressure|pressure)\b/i,
    tokens: ["tire pressure", "pressure"],
  },
  { re: /\b(tread\s*depth|tread)\b/i, tokens: ["tread depth", "tread"] },
  { re: /\b(inner)\b/i, tokens: ["inner"] },
  { re: /\b(outer)\b/i, tokens: ["outer"] },
  { re: /\b(left)\b/i, tokens: ["left"] },
  { re: /\b(right)\b/i, tokens: ["right"] },

  { re: /\b(steer)\b/i, tokens: ["steer"] },
  { re: /\b(drive)\b/i, tokens: ["drive"] },
  { re: /\b(tag)\b/i, tokens: ["tag axle"] },
  { re: /\b(trailer)\b/i, tokens: ["trailer"] },

  { re: /\b(leak\s*rate)\b/i, tokens: ["leak rate"] },
  {
    re: /\b(governor|gov\s*cut|cut\s*out|cut\s*in)\b/i,
    tokens: ["gov", "governor", "cut out", "cut in"],
  },

  { re: /\b(voltage|volts|v\b)\b/i, tokens: ["voltage", "v"] },
  { re: /\b(cca|cranking)\b/i, tokens: ["cca", "cranking"] },
  { re: /\b(rated|rating)\b/i, tokens: ["rated", "rating"] },
  { re: /\b(tested|test|load\s*test|loadtest)\b/i, tokens: ["tested", "test"] },
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

function stripStatusForMatch(text: string): string {
  return stripStatusWords(text);
}

function hasConditionFindingLanguage(text: string): boolean {
  const t = norm(text);
  if (!t) return false;
  return /\b(fail|failed|recommend|recommended|rec|bulge|rim|crack|cracked|lug|loose)\b/.test(t);
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

  const cleanedSpeech = stripStatusForMatch(rawSpeech);
  const speechKey = norm(cleanedSpeech);
  if (speechKey) {
    if (l === speechKey) score += 60;
    else if (l.includes(speechKey)) score += 55;
    else if (speechKey.includes(l)) score += 35;
  }

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
    if (tok === "slack" || tok === "adjuster" || tok === "slack adjuster") {
      if (l.includes("slack")) score += 24;
      if (l.includes("adjuster")) score += 24;
      continue;
    }
    if (tok === "brake chamber" || tok === "chamber") {
      if (l.includes("chamber")) score += 24;
      continue;
    }
    if (tok === "brake line" || tok === "line" || tok === "hose") {
      if (l.includes("line") || l.includes("hose")) score += 20;
      continue;
    }
    if (tok === "air tank" || tok === "tank") {
      if (l.includes("tank")) score += 22;
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

  if ((mode === "measurement" || mode === "update_value") && hasConditionFindingLanguage(rawSpeech)) {
    if (isGridLikeLabel(label)) score -= 50;
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
    hintTokens.includes("pushrod travel") ||
    hintTokens.includes("slack") ||
    hintTokens.includes("adjuster") ||
    hintTokens.includes("slack adjuster") ||
    hintTokens.includes("brake chamber") ||
    hintTokens.includes("chamber") ||
    hintTokens.includes("brake line") ||
    hintTokens.includes("line") ||
    hintTokens.includes("hose") ||
    hintTokens.includes("air tank") ||
    hintTokens.includes("tank");

  if (t.includes("battery") && wantsBattery) score += 20;
  if (t.includes("tire") && wantsTire) score += 20;
  if (t.includes("brake") && wantsBrake) score += 20;
  if (t.includes("air") && wantsBrake) score += 12;

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

  const cleanedSpeech = stripStatusForMatch(speech);
  const speechForHints = cleanedSpeech || speech;

  const hints = extractHintTokens(speechForHints);
  const explicitSection = explicitSectionName ? norm(explicitSectionName) : "";

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

      const ls = scoreLabel({
        label,
        hintTokens: hints,
        mode,
        rawSpeech: speechForHints,
      });
      const total = ls + secScore;

      if (total <= 0) continue;

      if (!best || total > best.score) {
        best = { score: total, target: { sectionIndex: sIdx, itemIndex: iIdx } };
      }
    }
  }

  if (!best || best.score < 20) return null;
  return best.target;
}

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

function resolveSectionIndexByName(
  session: InspectionSession,
  sectionName: string,
): number {
  const needle = norm(sectionName);
  if (!needle) return -1;

  return session.sections.findIndex((sec) =>
    norm(String(sec.title ?? "")).includes(needle),
  );
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

function inferStatusFromText(text: string): InspectionItemStatus | undefined {
  const t = norm(text);
  if (!t) return undefined;

  const direct = normalizeStatusMaybe(t);
  if (direct) return direct;

  if (/\b(ok|okay|pass|passed|good)\b/.test(t)) return "ok";
  if (/\b(fail|failed|bad|fails)\b/.test(t)) return "fail";
  if (/\b(n\/?a|not\s*applicable)\b/.test(t)) return "na";
  if (/\b(recommend|recommended|rec)\b/.test(t)) return "recommend";

  return undefined;
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

  return out.length ? out : undefined;
}

function coerceLaborHoursFromUnknown(v: unknown): number | null | undefined {
  if (v === null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

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
  const idx =
    typeof session.currentSectionIndex === "number"
      ? session.currentSectionIndex
      : 0;
  if (idx < 0) return 0;
  if (idx >= session.sections.length) {
    return Math.max(0, session.sections.length - 1);
  }
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



function findItemIndexByNamePreferNonGrid(params: {
  items: InspectionSession["sections"][number]["items"];
  needle: string;
  gateOutGridLabels: boolean;
}): number {
  const { items, needle, gateOutGridLabels } = params;
  const n = norm(needle);
  if (!n) return -1;

  if (gateOutGridLabels) {
    const idx = items.findIndex((it) => {
      const label = String(it.name ?? it.item ?? "");
      return norm(label).includes(n) && !isGridLikeLabel(label);
    });
    if (idx >= 0) return idx;
  }

  return items.findIndex((it) =>
    norm(String(it.name ?? it.item ?? "")).includes(n),
  );
}

function mergeNotes(existing: unknown, incoming: string): string {
  const ex = String(existing ?? "").trim();
  const inc = String(incoming ?? "").trim();
  if (!inc) return ex;
  if (!ex) return inc;
  if (norm(ex).includes(norm(inc))) return ex;
  return `${ex}; ${inc}`;
}

function isCorrectionSpeech(text?: string): boolean {
  const t = norm(text ?? "");
  return t.includes("change that") || t.includes("actually") || t.includes("undo last");
}

function inferNoteFromSpeech(params: {
  rawSpeech?: string;
  item?: string;
  section?: string;
  status?: InspectionItemStatus;
}): string | undefined {
  const { rawSpeech, item, section, status } = params;
  if (!rawSpeech) return undefined;
  if (status !== "fail" && status !== "recommend") return undefined;

  const speech = norm(rawSpeech);
  if (!speech) return undefined;

  const itemN = norm(item ?? "");
  const sectionN = norm(section ?? "");

  let tail = "";
  if (itemN) {
    const idx = speech.indexOf(itemN);
    if (idx >= 0) tail = speech.slice(idx + itemN.length);
  }

  const candidateBase = tail || speech;

  let candidate = candidateBase;
  if (itemN) {
    candidate = candidate.replace(new RegExp(`\\b${itemN}\\b`, "g"), " ");
  }
  if (sectionN) {
    candidate = candidate.replace(new RegExp(`\\b${sectionN}\\b`, "g"), " ");
  }

  candidate = stripStatusWords(candidate).trim();

  if (!candidate) return undefined;
  if (itemN && norm(candidate) === itemN) return undefined;

  return candidate;
}

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

    status = normalizeStatusMaybe((c as { status?: unknown }).status);
    value = (c as { value?: unknown }).value as string | number | undefined;
    unit = (c as { unit?: unknown }).unit as string | undefined;

    if (typeof (c as { sectionIndex?: unknown }).sectionIndex === "number") {
      explicitSectionIndex = (c as { sectionIndex: number }).sectionIndex;
    }
    if (typeof (c as { itemIndex?: unknown }).itemIndex === "number") {
      explicitItemIndex = (c as { itemIndex: number }).itemIndex;
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
    const c = command as ParsedCommandNameBased | ParsedInspectionFindingCommand;
    mode = c.type;

    if ("section" in c && typeof c.section === "string") section = c.section;
    if ("item" in c && typeof c.item === "string") item = c.item;

    if ("status" in c) status = normalizeStatusMaybe(c.status);
    if ("note" in c && typeof c.note === "string") note = c.note;
    if ("value" in c) value = c.value;
    if ("unit" in c && typeof c.unit === "string") unit = c.unit;

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

  const isStatusMode =
    mode === "status" || mode === "update_status" || mode === "inspection_finding";
  if (isStatusMode && !status) {
    const fromSpeech = rawSpeech ? inferStatusFromText(rawSpeech) : undefined;
    const fromItem = item ? inferStatusFromText(item) : undefined;
    const fromNote = note ? inferStatusFromText(note) : undefined;
    status = fromSpeech ?? fromItem ?? fromNote;
  }

  const findingCandidate = command as Partial<ParsedInspectionFindingCommand>;
  if (findingCandidate.type === "inspection_finding") {
    const finding = findingCandidate as ParsedInspectionFindingCommand;

    if (!status) status = finding.status;
    if (!item && finding.item) item = finding.item;
    if (!note && finding.note) note = finding.note;
    if (!parts && Array.isArray(finding.parts)) parts = finding.parts;
    if (
      laborHours === undefined &&
      (typeof finding.laborHours === "number" || finding.laborHours === null)
    ) {
      laborHours = finding.laborHours;
    }
  }

  const cleanedItem = item ? stripStatusWords(item) : "";
  if (cleanedItem && cleanedItem !== norm(item ?? "")) {
    item = cleanedItem;
  }

  if (
    isStatusMode &&
    (status === "fail" || status === "recommend") &&
    (!note || !String(note).trim())
  ) {
    const inferred = inferNoteFromSpeech({ rawSpeech, item, section, status });
    if (inferred) note = inferred;
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
        ? clampTargetToSession(session, {
            sectionIndex: explicitSectionIndex,
            itemIndex: 0,
          }).sectionIndex
        : isThisSectionName(section)
          ? currentIdx
          : section
            ? (() => {
                const byName = resolveSectionIndexByName(session, section);
                return byName >= 0 ? byName : currentIdx;
              })()
            : currentIdx;

    const st = status ?? normalizeStatusMaybe((command as Record<string, unknown>).status);
    if (!st) return null;

    const itemsLen = session.sections[sIdx]?.items?.length ?? 0;
    for (let i = 0; i < itemsLen; i += 1) {
      updateItem(sIdx, i, { status: st });
    }

    return itemsLen > 0 ? { sectionIndex: sIdx, itemIndex: 0 } : null;
  }

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
    const targetRow =
      session.sections[safe.sectionIndex]?.items?.[safe.itemIndex] ??
      ({} as Record<string, unknown>);
    const targetLabel = String(
      (targetRow as { item?: unknown; name?: unknown }).item ??
        (targetRow as { name?: unknown }).name ??
        "",
    );

    switch (mode) {
      case "inspection_finding": {
        const finding = command as ParsedInspectionFindingCommand;

        const findingTarget = resolveTargetFromSpeech({
          speech: [finding.section, finding.item, finding.note]
            .filter(Boolean)
            .join(" "),
          sections: session.sections,
          explicitSectionName: finding.section,
          mode: "update_status",
        });

        if (!findingTarget) {
          return null;
        }

        const safeFindingTarget = clampTargetToSession(session, findingTarget);
        const existingRow =
          session.sections[safeFindingTarget.sectionIndex]?.items?.[
            safeFindingTarget.itemIndex
          ] ?? ({} as Record<string, unknown>);

        const findingUpdates: Partial<
          InspectionSession["sections"][number]["items"][number]
        > = {
          status: finding.status,
        };

        if (finding.note && finding.note.trim()) {
          findingUpdates.notes = mergeNotes(
            (existingRow as { notes?: unknown }).notes,
            finding.note.trim(),
          );
        }

        if (Array.isArray(finding.parts) && finding.parts.length > 0) {
          findingUpdates.parts = finding.parts.map((part) => ({
            description: String(part.description ?? "").trim(),
            qty:
              typeof part.qty === "number" &&
              Number.isFinite(part.qty) &&
              part.qty > 0
                ? part.qty
                : 1,
          }));
        }

        if (finding.laborHours !== undefined) {
          findingUpdates.laborHours = finding.laborHours;
        }

        updateItem(
          safeFindingTarget.sectionIndex,
          safeFindingTarget.itemIndex,
          findingUpdates,
        );

        return safeFindingTarget;
      }

      case "update_status":
      case "status": {
        if (status) itemUpdates.status = status;
        if ((status === "fail" || status === "recommend") && note) {
          itemUpdates.notes = mergeNotes(
            (targetRow as { notes?: unknown }).notes,
            note,
          );
        }
        break;
      }

      case "update_value":
      case "measurement": {
        if (value !== undefined) {
          if (isBatteryLikeLabel(targetLabel)) {
            if ((unit ?? "").toUpperCase() === "CCA") {
              (itemUpdates as Record<string, unknown>).cca = value;
            } else if ((unit ?? "").toUpperCase() === "V") {
              (itemUpdates as Record<string, unknown>).voltage = value;
            }
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
        if (note) {
          itemUpdates.notes = mergeNotes(
            (targetRow as { notes?: unknown }).notes,
            note,
          );
        }
        break;

      case "recommend":
        if (note) {
          itemUpdates.status = "recommend";
          itemUpdates.notes = mergeNotes(
            (targetRow as { notes?: unknown }).notes,
            note,
          );
          itemUpdates.recommend = [note];
        }
        break;

      default:
        break;
    }

    if (parts) itemUpdates.parts = parts;
    if (laborHours !== undefined) itemUpdates.laborHours = laborHours;

    if (Object.keys(itemUpdates).length > 0) {
      updateItem(safe.sectionIndex, safe.itemIndex, itemUpdates);
    }

    return Object.keys(itemUpdates).length > 0 ? safe : null;
  }

  const currentSectionIndex = getSafeCurrentSectionIndex(session);

  const sectionIndexByName =
    section && section.trim().length > 0 && !isThisSectionName(section)
      ? session.sections.findIndex((sec) =>
          String(sec.title ?? "").toLowerCase().includes(section.toLowerCase()),
        )
      : -1;

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
      section &&
      !isThisSectionName(section) &&
      resolveSectionIndexByName(session, section) >= 0
        ? section
        : undefined;

    const rawHint = String(rawSpeech ?? "").trim();

    const parsedHint = buildSpeechHintFromCommand({
      section,
      item: item ? stripStatusWords(item) : undefined,
      note,
      unit,
    });

    const hint =
      rawHint.length > 0
        ? rawHint
        : parsedHint.length > 0
          ? parsedHint
          : "";

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
    if (isCorrectionSpeech(rawSpeech)) {
      const sIdx = getSafeCurrentSectionIndex(session);
      const iIdx = Math.max(
        0,
        Math.min(session.currentItemIndex ?? 0, (session.sections[sIdx]?.items?.length ?? 1) - 1),
      );
      target = { sectionIndex: sIdx, itemIndex: iIdx };
    }
  }

  if (!target) {
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
  const speechNorm = norm(rawSpeech ?? "");
  if (speechNorm.includes("left side") || speechNorm.includes("right side")) {
    const wanted = speechNorm.includes("left side") ? "left" : "right";
    const currentLabel = norm(
      String(
        session.sections[safeTarget.sectionIndex]?.items?.[safeTarget.itemIndex]?.item ??
          session.sections[safeTarget.sectionIndex]?.items?.[safeTarget.itemIndex]?.name ??
          "",
      ),
    ).replace(/\bleft\b|\bright\b/g, "").trim();
    const siblingIdx = session.sections[safeTarget.sectionIndex]?.items?.findIndex((it) => {
      const l = norm(String(it.item ?? it.name ?? ""));
      return l.includes(wanted) && l.replace(/\bleft\b|\bright\b/g, "").trim() === currentLabel;
    });
    if (typeof siblingIdx === "number" && siblingIdx >= 0) safeTarget.itemIndex = siblingIdx;
  }

  const itemUpdates: Partial<
    InspectionSession["sections"][number]["items"][number]
  > = {};
  const targetRow =
    session.sections[safeTarget.sectionIndex]?.items?.[safeTarget.itemIndex] ??
    ({} as Record<string, unknown>);
  const targetLabel = String(
    (targetRow as { item?: unknown; name?: unknown }).item ??
      (targetRow as { name?: unknown }).name ??
      "",
  );

  switch (mode) {
    case "inspection_finding": {
      if (status) itemUpdates.status = status;
      if (note) {
        itemUpdates.notes = mergeNotes(
          (targetRow as { notes?: unknown }).notes,
          note,
        );
      }
      break;
    }

    case "update_status":
    case "status": {
      if (status) itemUpdates.status = status;
      if ((status === "fail" || status === "recommend") && note) {
        itemUpdates.notes = mergeNotes(
          (targetRow as { notes?: unknown }).notes,
          note,
        );
      }
      break;
    }

    case "update_value":
    case "measurement": {
      if (value !== undefined) {
        if (isBatteryLikeLabel(targetLabel)) {
          if ((unit ?? "").toUpperCase() === "CCA") {
            (itemUpdates as Record<string, unknown>).cca = value;
          } else if ((unit ?? "").toUpperCase() === "V") {
            (itemUpdates as Record<string, unknown>).voltage = value;
          }
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
      if (note) {
        itemUpdates.notes = mergeNotes(
          (targetRow as { notes?: unknown }).notes,
          note,
        );
      }
      break;

    case "recommend":
      if (note) {
        itemUpdates.status = "recommend";
        itemUpdates.notes = mergeNotes(
          (targetRow as { notes?: unknown }).notes,
          note,
        );
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
