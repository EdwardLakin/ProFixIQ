// features/service-catalog/lib/matchMasterItems.ts
//
// Maps checklist items from imported catalogs onto the canonical inspection
// catalog. The matcher is deliberately precision-first: it uses applicability,
// section context, domain normalization and token rarity, but leaves uncertain
// rows exactly as the shop wrote them instead of attaching the wrong spec/unit.

import {
  buildFromMaster,
  highwayMasterInspectionList,
  masterInspectionList,
  type BrakeSystem,
  type DutyClass,
  type InspectionCategory as MasterCategory,
  type VehicleType,
} from "@/features/inspections/lib/inspection/masterInspectionList";

export type CatalogChecklistItem = {
  item: string;
  unit: string | null;
  specCode: string | null;
  cvipCode: string | null;
};

export type MasterMatchKind = "master" | "custom";
export type CatalogAssetScope = "on_road" | "off_road" | "unknown";

export type MatchedChecklistItem = CatalogChecklistItem & {
  source: MasterMatchKind;
  /** Original CSV wording, retained for preview/audit. */
  original: string;
};

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "of", "for", "to", "in", "on", "at", "with", "by", "is", "are", "all", "any",
  "check", "inspect", "inspection", "verify", "test", "perform", "measure", "confirm", "review", "document",
  "ensure", "examine", "evaluate", "record", "per", "system", "condition", "function", "operation", "operational",
  "service", "applicable", "equipped", "visible", "basic",
]);

/**
 * These words describe condition rather than the inspected component. They
 * still contribute to ranking, but at lower weight so "brake chamber leakage"
 * can resolve to "Brake chambers" without pretending "chamber" == "leak".
 */
const LOW_SIGNAL_WORDS = new Set([
  "damage", "damaged", "leak", "leakage", "leaking", "chafe", "chafing", "abrasion",
  "crack", "cracked", "cracking", "wear", "worn", "travel", "play", "performance",
  "indicator", "indicators", "warning", "warnings", "mount", "mounting", "hardware",
]);

const TOKEN_ALIASES: Record<string, string> = {
  lamps: "light",
  lamp: "light",
  lights: "light",
  tyres: "tire",
  tyre: "tire",
  licenced: "licensed",
  licence: "license",
  linings: "lining",
  shoes: "shoe",
  chambers: "chamber",
  adjusters: "adjuster",
  rotors: "rotor",
  drums: "drum",
  hoses: "hose",
  fittings: "fitting",
  springs: "spring",
  shocks: "shock",
  bushings: "bushing",
  bearings: "bearing",
  seals: "seal",
  wheels: "wheel",
  studs: "stud",
  mirrors: "mirror",
  wipers: "wiper",
  belts: "belt",
  clamps: "clamp",
  cylinders: "cylinder",
  controls: "control",
  interlocks: "interlock",
  rollers: "roller",
  idlers: "idler",
  tracks: "track",
  alarms: "alarm",
  terminals: "terminal",
  cables: "cable",
  connections: "connection",
  codes: "code",
  faults: "fault",
  filters: "filter",
};

function normalizePhrases(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bair[\s-]*bags?\b/g, "air suspension")
    .replace(/\bair[\s-]*springs?\b/g, "air suspension")
    .replace(/\bglad[\s-]*hands?\b/g, "gladhand")
    .replace(/\bking[\s-]*pin\b/g, "kingpin")
    .replace(/\bfifth[\s-]*wheel\b/g, "fifth wheel")
    .replace(/\btie[\s-]*rods?\b/g, "tie rod")
    .replace(/\bpush[\s-]*rods?\b/g, "push rod")
    .replace(/\bwheel[\s-]*ends?\b/g, "wheel hub")
    .replace(/\bfreeze protection\b/g, "concentration")
    .replace(/\banti[\s-]*freeze\b/g, "coolant")
    .replace(/\bantifreeze\b/g, "coolant")
    .replace(/\bshock absorbers?\b/g, "shock")
    .replace(/\blicence\b/g, "license");
}

function stem(word: string): string {
  const alias = TOKEN_ALIASES[word];
  if (alias) return alias;
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith("es") && /(ch|sh|x|s|z)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function tokens(text: string | null | undefined): string[] {
  return Array.from(
    new Set(
      normalizePhrases(text ?? "")
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 1 && !STOP_WORDS.has(word))
        .map(stem)
        .filter((word) => !STOP_WORDS.has(word)),
    ),
  );
}

function normalizeForCompare(text: string): string {
  return tokens(text).join(" ");
}

function tokenWeight(token: string): number {
  return LOW_SIGNAL_WORDS.has(token) ? 0.3 : 1;
}

function weightedSize(input: string[]): number {
  return input.reduce((sum, token) => sum + tokenWeight(token), 0);
}

type MasterEntry = {
  item: string;
  unit: string | null;
  specCode: string | null;
  cvipCode: string | null;
  vehicleTypes: VehicleType[] | undefined;
  systems: BrakeSystem[] | undefined;
  dutyClasses: DutyClass[] | undefined;
  offRoad: boolean;
  categoryTitle: string;
  categoryTokens: string[];
  tokens: string[];
  key: string;
  normalized: string;
};

function indexMaster(list: MasterCategory[]): MasterEntry[] {
  const entries: MasterEntry[] = [];
  // Keep one canonical display row per scope. The same wording may legitimately
  // exist in both highway and off-road catalogs with different applicability.
  const seen = new Set<string>();

  for (const category of list) {
    for (const item of category.items) {
      const normalized = normalizeForCompare(item.item);
      const itemTokens = tokens(item.item);
      if (!normalized || itemTokens.length === 0) continue;
      const offRoad = item.catalogScope === "off_road";
      const key = `${offRoad ? "off" : "road"}:${normalized}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({
        item: item.item,
        unit: item.unit ?? null,
        specCode: item.specCode ?? null,
        cvipCode: item.cvipCode ?? null,
        vehicleTypes: item.vehicleTypes,
        systems: item.systems,
        dutyClasses: item.dutyClasses,
        offRoad,
        categoryTitle: category.title,
        categoryTokens: tokens(category.title),
        tokens: itemTokens,
        key,
        normalized,
      });
    }
  }
  return entries;
}

let cachedIndex: MasterEntry[] | null = null;

function masterIndex(): MasterEntry[] {
  cachedIndex ??= indexMaster(masterInspectionList);
  return cachedIndex;
}

export const MASTER_MATCH_MIN_SCORE = 0.55;
export const MASTER_MATCH_MIN_MARGIN = 0.07;

export type MatchContext = {
  vehicleType: VehicleType | null;
  brakeSystem?: BrakeSystem | null;
  dutyClass?: DutyClass | null;
  assetScope?: CatalogAssetScope;
  templateName?: string | null;
  sectionTitle?: string | null;
};

function tokenFrequency(context: MatchContext): Map<string, number> {
  const frequency = new Map<string, number>();
  for (const entry of masterIndex()) {
    if (!applies(entry, context)) continue;
    for (const token of new Set(entry.tokens.filter((t) => !LOW_SIGNAL_WORDS.has(t)))) {
      frequency.set(token, (frequency.get(token) ?? 0) + 1);
    }
  }
  return frequency;
}

type Scored = {
  entry: MasterEntry;
  score: number;
  csvCoverage: number;
  masterCoverage: number;
  strongShared: number;
  rareShared: boolean;
};

function applies(entry: MasterEntry, context: MatchContext): boolean {
  const scope = context.assetScope ?? (context.vehicleType ? "on_road" : "unknown");
  if (scope === "on_road" && entry.offRoad) return false;
  if (scope === "off_road" && !entry.offRoad) return false;

  if (!entry.offRoad && context.vehicleType && entry.vehicleTypes?.length && !entry.vehicleTypes.includes(context.vehicleType)) {
    return false;
  }
  if (context.brakeSystem && entry.systems?.length && !entry.systems.includes(context.brakeSystem)) {
    return false;
  }
  if (context.dutyClass && entry.dutyClasses?.length && !entry.dutyClasses.includes(context.dutyClass)) {
    return false;
  }
  return true;
}

function overlapRatio(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const bSet = new Set(b);
  const shared = a.filter((token) => bSet.has(token)).length;
  return shared / Math.min(a.length, b.length);
}

function score(csvTokens: string[], entry: MasterEntry, context: MatchContext): Scored | null {
  const masterSet = new Set(entry.tokens);
  const shared = csvTokens.filter((token) => masterSet.has(token));
  const strongSharedTokens = shared.filter((token) => !LOW_SIGNAL_WORDS.has(token));
  if (strongSharedTokens.length === 0) return null;

  const sharedWeight = weightedSize(shared);
  const csvWeight = weightedSize(csvTokens);
  const masterWeight = weightedSize(entry.tokens);
  const csvCoverage = csvWeight > 0 ? sharedWeight / csvWeight : 0;
  const masterCoverage = masterWeight > 0 ? sharedWeight / masterWeight : 0;
  const f1 = csvCoverage + masterCoverage > 0
    ? (2 * csvCoverage * masterCoverage) / (csvCoverage + masterCoverage)
    : 0;

  const frequency = tokenFrequency(context);
  const rareShared = strongSharedTokens.some((token) => (frequency.get(token) ?? Number.MAX_SAFE_INTEGER) <= 3);

  const sectionTokens = tokens(context.sectionTitle);
  const sectionContext = overlapRatio(sectionTokens, entry.categoryTokens);
  const templateTokens = tokens(context.templateName).filter((token) => token !== "inspection" && token !== "preventive" && token !== "maintenance");
  const templateContext = overlapRatio(templateTokens, entry.categoryTokens);

  const normalizedCsv = csvTokens.join(" ");
  const phraseBonus =
    normalizedCsv === entry.normalized ||
    (normalizedCsv.length >= 8 && entry.normalized.length >= 8 &&
      (normalizedCsv.includes(entry.normalized) || entry.normalized.includes(normalizedCsv)))
      ? 0.12
      : 0;

  const rarityBonus = rareShared ? 0.07 : 0;
  const contextBonus = Math.min(0.12, sectionContext * 0.1 + templateContext * 0.03);
  const scoreValue =
    (0.45 * f1) +
    (0.2 * csvCoverage) +
    (0.18 * masterCoverage) +
    phraseBonus +
    rarityBonus +
    contextBonus;

  return {
    entry,
    score: Math.min(1, scoreValue),
    csvCoverage,
    masterCoverage,
    strongShared: strongSharedTokens.length,
    rareShared,
  };
}

/** Best high-confidence canonical master item for one checklist line, or null. */
export function findMasterItem(text: string, context: MatchContext): MasterEntry | null {
  const csvTokens = tokens(text);
  if (csvTokens.length === 0) return null;

  const normalized = normalizeForCompare(text);
  const scored: Scored[] = [];

  for (const entry of masterIndex()) {
    if (!applies(entry, context)) continue;
    if (entry.normalized === normalized) return entry;

    const candidate = score(csvTokens, entry, context);
    if (!candidate) continue;

    // A single shared noun is only enough when it is unusual in the applicable
    // slice of the master catalog. This lets "chambers ... leakage" resolve
    // safely without making generic words such as "components" authoritative.
    if (candidate.strongShared < 2 && !candidate.rareShared) continue;
    if (candidate.csvCoverage < 0.48 || candidate.masterCoverage < 0.42) continue;
    scored.push(candidate);
  }

  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score - a.score);

  const [best, second] = scored;
  if (best.score < MASTER_MATCH_MIN_SCORE) return null;
  if (second && second.entry.key !== best.entry.key && best.score - second.score < MASTER_MATCH_MIN_MARGIN) return null;
  return best.entry;
}

export type MappedSection = { title: string; items: MatchedChecklistItem[] };

function deriveContextFromSections(
  sections: Array<{ title: string; items: string[] }>,
  context: MatchContext,
): MatchContext {
  const text = sections
    .flatMap((section) => [section.title, ...section.items])
    .join(" ")
    .toLowerCase();

  let brakeSystem = context.brakeSystem ?? null;
  if (!brakeSystem) {
    const airBrakeSignal =
      /\bair[\s-]*(brake|system|supply|pressure|leak)|\bbrake chambers?\b|\bslack adjusters?\b|\bpush[\s-]*rods?\b|\bgovernor\b|\bglad[\s-]*hands?\b|\bair dryer\b|\bcompressor build\b/.test(text);
    const hydraulicBrakeSignal =
      /\bhydraulic brakes?\b|\bbrake fluid\b|\bmaster cylinder\b|\bcalipers?\b/.test(text);
    if (airBrakeSignal && !hydraulicBrakeSignal) brakeSystem = "air_brake";
    else if (hydraulicBrakeSignal && !airBrakeSignal) brakeSystem = "hyd_brake";
  }

  let assetScope = context.assetScope;
  if (!assetScope) {
    if (context.vehicleType) {
      assetScope = "on_road";
    } else {
      const offRoadSignals = [
        /\bhydraulic (oil|hose|line|cylinder|system)\b/,
        /\bundercarriage\b/,
        /\btracks?\b/,
        /\bfinal drive\b/,
        /\bhour meter\b/,
        /\binterlocks?\b/,
        /\brollers?\b/,
        /\bidlers?\b/,
        /\battachments?\b/,
      ].filter((re) => re.test(text)).length;
      const onRoadSignals = [
        /\bslack adjusters?\b/,
        /\bbrake chambers?\b/,
        /\bgovernor\b/,
        /\bglad[\s-]*hands?\b/,
        /\bfifth[\s-]*wheel\b/,
        /\btrailer\b/,
      ].filter((re) => re.test(text)).length;

      if (offRoadSignals >= 2 && offRoadSignals > onRoadSignals) assetScope = "off_road";
      else if (onRoadSignals >= 2 || brakeSystem === "air_brake") assetScope = "on_road";
      else assetScope = "unknown";
    }
  }

  return {
    ...context,
    brakeSystem,
    assetScope,
    dutyClass: context.dutyClass ?? (brakeSystem === "air_brake" ? "heavy" : null),
  };
}

function splitCompound(text: string): string[] {
  return text
    .split(/,|;|\band\b|&/i)
    .map((part) => part.trim())
    .filter((part) => tokens(part).length > 0);
}

/**
 * Map shop sections/items onto the canonical master list. Section titles and
 * source order remain the shop's. A master item is used at most once.
 */
export function mapSectionsToMaster(
  sections: Array<{ title: string; items: string[] }>,
  context: MatchContext,
): MappedSection[] {
  const used = new Set<string>();
  const resolvedContext = deriveContextFromSections(sections, context);

  const toItem = (match: MasterEntry, original: string): MatchedChecklistItem => ({
    item: match.item,
    unit: match.unit,
    specCode: match.specCode,
    cvipCode: match.cvipCode,
    source: "master",
    original,
  });

  return sections.map((section) => ({
    title: section.title,
    items: section.items.flatMap((original): MatchedChecklistItem[] => {
      const itemContext: MatchContext = { ...resolvedContext, sectionTitle: section.title };

      // Prefer a complete compound expansion when every component independently
      // resolves. This prevents "brake chambers and slack adjusters" from being
      // collapsed to just one of the two checks.
      const parts = splitCompound(original);
      if (parts.length >= 2 && parts.length <= 4) {
        const matches = parts.map((part) => findMasterItem(part, itemContext));
        const keys = matches.map((match) => match?.key);
        const distinct = new Set(keys).size === keys.length;
        if (
          matches.every((match): match is MasterEntry => match !== null) &&
          distinct &&
          keys.every((key) => key && !used.has(key))
        ) {
          const resolved = matches as MasterEntry[];
          resolved.forEach((match) => used.add(match.key));
          return resolved.map((match) => toItem(match, original));
        }
      }

      const whole = findMasterItem(original, itemContext);
      if (whole && !used.has(whole.key)) {
        used.add(whole.key);
        return [toItem(whole, original)];
      }

      return [{
        item: original,
        unit: null,
        specCode: null,
        cvipCode: null,
        source: "custom",
        original,
      }];
    }),
  }));
}

/** Highway master list as sections, used when a template lists no items. */
export function buildSectionsFromMasterList(args: {
  vehicleType: VehicleType;
  brakeSystem: BrakeSystem;
  dutyClass?: DutyClass;
  targetCount: number;
}): MappedSection[] {
  const sections = buildFromMaster(args);
  return sections.map((section) => ({
    title: section.title,
    items: section.items.map((it) => ({
      item: it.item,
      unit: it.unit ?? null,
      specCode: it.specCode ?? null,
      cvipCode: it.cvipCode ?? null,
      source: "master" as const,
      original: it.item,
    })),
  }));
}

export { highwayMasterInspectionList };
