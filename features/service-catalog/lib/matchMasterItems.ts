// features/service-catalog/lib/matchMasterItems.ts
//
// Maps checklist items from an imported catalog onto the shop's master
// inspection list, so imported inspections use the same canonical wording,
// units, spec codes and CVIP codes as inspections built in the app.
//
// Matching is deterministic and conservative: a wrong unit/threshold on a
// safety item is worse than an item left as the shop wrote it. An item is only
// adopted from the master list when nearly all of its meaningful words are in
// the master item, the master item adds little that the shop did not say, and
// no other master item is a close second.

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

export type MatchedChecklistItem = CatalogChecklistItem & {
  /** "master" when adopted from the master list; "custom" when kept as the shop wrote it. */
  source: MasterMatchKind;
  /** The text in the CSV, kept for the preview. */
  original: string;
};

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "of", "for", "to", "in", "on", "at", "with", "by", "is", "are", "all", "any",
  "check", "inspect", "inspection", "verify", "test", "perform", "measure", "confirm", "review", "document",
  "ensure", "examine", "evaluate", "record", "per", "system", "condition", "function", "operation", "operational",
]);

const SYNONYMS: Record<string, string> = {
  lamp: "light",
  lamps: "light",
  lights: "light",
  tyre: "tire",
  tyres: "tire",
  accessory: "auxiliary",
  extinguishers: "extinguisher",
};

function stem(word: string): string {
  if (SYNONYMS[word]) return SYNONYMS[word];
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith("es") && /(ch|sh|x|s|z)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function tokens(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/&/g, " and ")
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
        .map(stem),
    ),
  );
}

function normalizeForCompare(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

type MasterEntry = {
  item: string;
  unit: string | null;
  specCode: string | null;
  cvipCode: string | null;
  vehicleTypes: VehicleType[] | undefined;
  offRoad: boolean;
  tokens: string[];
  key: string;
};

function indexMaster(list: MasterCategory[]): MasterEntry[] {
  const entries: MasterEntry[] = [];
  const seen = new Set<string>();
  for (const category of list) {
    for (const item of category.items) {
      const key = normalizeForCompare(item.item);
      const t = tokens(item.item);
      if (t.length === 0 || seen.has(key)) continue;
      seen.add(key);
      entries.push({
        item: item.item,
        unit: item.unit ?? null,
        specCode: item.specCode ?? null,
        cvipCode: item.cvipCode ?? null,
        vehicleTypes: item.vehicleTypes,
        offRoad: item.catalogScope === "off_road",
        tokens: t,
        key,
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

export const MASTER_MATCH_MIN_CSV_COVERAGE = 0.75;
export const MASTER_MATCH_MIN_MASTER_COVERAGE = 0.6;
export const MASTER_MATCH_MIN_MARGIN = 0.1;

type Scored = { entry: MasterEntry; score: number };

function score(csv: string[], master: MasterEntry): Scored | null {
  const masterSet = new Set(master.tokens);
  const shared = csv.filter((t) => masterSet.has(t)).length;
  if (shared < 1) return null;
  const csvCoverage = shared / csv.length;
  const masterCoverage = shared / master.tokens.length;
  // Short items ("Horn") may match a short master item on one word; longer
  // items need at least two words in common.
  if (shared < 2 && !(csv.length === 1 && master.tokens.length <= 2)) return null;
  if (csvCoverage < MASTER_MATCH_MIN_CSV_COVERAGE || masterCoverage < MASTER_MATCH_MIN_MASTER_COVERAGE) return null;
  return { entry: master, score: (2 * shared) / (csv.length + master.tokens.length) };
}

export type MatchContext = {
  /** Canonical vehicle type for the template, when known. Filters master candidates. */
  vehicleType: VehicleType | null;
};

/** Best unambiguous master item for one checklist line, or null. */
export function findMasterItem(text: string, context: MatchContext): MasterEntry | null {
  const csvTokens = tokens(text);
  if (csvTokens.length === 0) return null;

  const normalized = normalizeForCompare(text);
  const scored: Scored[] = [];
  for (const entry of masterIndex()) {
    // On-road templates never pull equipment-only checks; equipment templates
    // (no vehicle type) may use the off-road catalog.
    if (context.vehicleType) {
      if (entry.offRoad) continue;
      if (entry.vehicleTypes && entry.vehicleTypes.length > 0 && !entry.vehicleTypes.includes(context.vehicleType)) continue;
    }
    if (entry.key === normalized) return entry;
    const s = score(csvTokens, entry);
    if (s) scored.push(s);
  }
  if (scored.length === 0) return null;

  scored.sort((a, b) => b.score - a.score);
  const [best, second] = scored;
  if (second && second.entry.key !== best.entry.key && best.score - second.score < MASTER_MATCH_MIN_MARGIN) return null;
  return best.entry;
}

export type MappedSection = { title: string; items: MatchedChecklistItem[] };

/** Splits "brake chambers and slack adjusters" into its separate concepts. */
function splitCompound(text: string): string[] {
  return text
    .split(/,|;|\band\b|&/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Map the shop's sections/items onto the master list. Section titles and item
 * order stay as the shop wrote them; only matched items take the master
 * wording, unit and spec/CVIP codes. A master item is used at most once per
 * template.
 */
export function mapSectionsToMaster(
  sections: Array<{ title: string; items: string[] }>,
  context: MatchContext,
): MappedSection[] {
  const used = new Set<string>();

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
      const whole = findMasterItem(original, context);
      if (whole && !used.has(whole.key)) {
        used.add(whole.key);
        return [toItem(whole, original)];
      }

      // A line that names several things ("brake chambers and slack
      // adjusters") becomes those master items, but only when every part
      // resolves to its own unused master item; otherwise it stays as written.
      const parts = splitCompound(original);
      if (!whole && parts.length >= 2 && parts.length <= 4) {
        const matches = parts.map((part) => findMasterItem(part, context));
        const keys = matches.map((m) => m?.key);
        const distinct = new Set(keys).size === keys.length;
        if (matches.every((m): m is MasterEntry => m !== null) && distinct && keys.every((k) => k && !used.has(k))) {
          const resolved = matches as MasterEntry[];
          resolved.forEach((m) => used.add(m.key));
          return resolved.map((m) => toItem(m, original));
        }
      }

      return [{ item: original, unit: null, specCode: null, cvipCode: null, source: "custom", original }];
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
