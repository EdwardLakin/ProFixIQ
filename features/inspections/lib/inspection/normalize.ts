// features/inspections/lib/inspection/normalize.ts
import type { InspectionCategory, InspectionItem } from "./types";

/**
 * Accepts a variety of shapes from AI or user JSON
 * and normalizes into InspectionCategory[] with safe defaults.
 *
 * Supported:
 * - { categories: Section[] }
 * - Section[]
 * - Section (single)
 * - Section/items may use title|name; items can also be strings
 */
export function toInspectionCategories(input: unknown): InspectionCategory[] {
  if (!input) return [];

  // 1) Envelope: { categories: [...] }
  if (
    typeof input === "object" &&
    input !== null &&
    Array.isArray((input as Record<string, unknown>).categories)
  ) {
    return coerceSections(
      (input as Record<string, unknown>).categories as unknown[],
    );
  }

  // 2) Direct array of sections
  if (Array.isArray(input)) {
    return coerceSections(input as unknown[]);
  }

  // 3) Single section-like object
  if (isSectionLike(input)) {
    return coerceSections([input]);
  }

  return [];
}

/* -------------------------- helpers & type guards -------------------------- */

type SectionLike = {
  title?: unknown;
  name?: unknown;
  items?: unknown;
};

type ItemLike =
  | string
  | {
      item?: unknown;
      name?: unknown;
      title?: unknown;
      status?: unknown;
      notes?: unknown;
      value?: unknown;
      unit?: unknown;
      photoUrls?: unknown;
    };

function isSectionLike(x: unknown): x is SectionLike {
  if (!x || typeof x !== "object") return false;
  const s = x as SectionLike;
  return typeof s === "object" && ("items" in s || "title" in s || "name" in s);
}

function isItemString(x: unknown): x is string {
  return typeof x === "string";
}

function coerceTitle(v: unknown, fallback: string): string {
  if (typeof v === "string" && v.trim()) return v.trim();
  return fallback;
}

function coerceItemLabel(x: unknown): string | null {
  if (typeof x === "string" && x.trim()) return x.trim();
  if (!x || typeof x !== "object") return null;
  const r = x as Record<string, unknown>;
  const candidate =
    (typeof r.item === "string" && r.item) ||
    (typeof r.name === "string" && r.name) ||
    (typeof r.title === "string" && r.title) ||
    "";
  const trimmed = candidate.trim();
  return trimmed ? trimmed : null;
}

function coerceUnit(x: unknown): string | null | undefined {
  if (x == null) return undefined;
  return typeof x === "string" ? x : undefined;
}

function coerceValue(x: unknown): string | number | null | undefined {
  if (x == null) return null;
  if (typeof x === "string" || typeof x === "number") return x;
  return undefined;
}

function coerceNotes(x: unknown): string | undefined {
  return typeof x === "string" ? x : undefined;
}

function coercePhotoUrls(x: unknown): string[] | undefined {
  if (!Array.isArray(x)) return undefined;
  const urls = x.filter((u) => typeof u === "string") as string[];
  return urls.length ? urls : [];
}

function isStatus(x: unknown): x is InspectionItem["status"] {
  return x === "ok" || x === "fail" || x === "na" || x === "recommend";
}

function toInspectionItem(raw: ItemLike): InspectionItem | null {
  // string -> label
  if (isItemString(raw)) {
    const label = raw.trim();
    if (!label) return null;
    return { item: label, name: label };
  }

  // object -> try to extract label + optional fields
  const label = coerceItemLabel(raw);
  if (!label) return null;

  const r = raw as Record<string, unknown>;

  return {
    item: label,
    name: label,
    status: isStatus(r.status) ? r.status : undefined,
    notes: coerceNotes(r.notes),
    value: coerceValue(r.value),
    unit: coerceUnit(r.unit) ?? null, // keep null-friendly
    photoUrls: coercePhotoUrls(r.photoUrls),
  };
}

function coerceSections(sectionsIn: unknown[]): InspectionCategory[] {
  const out: InspectionCategory[] = [];

  sectionsIn.forEach((sec, idx) => {
    if (!isSectionLike(sec)) return;

    const s = sec as SectionLike;
    const title = coerceTitle(s.title ?? s.name, `Section ${idx + 1}`);

    const rawItems = Array.isArray(s.items) ? (s.items as ItemLike[]) : [];
    const items = rawItems
      .map(toInspectionItem)
      .filter((i): i is InspectionItem => i !== null);

    if (items.length) out.push({ title, items });
  });

  return out;
}