export type FleetParseSection = {
  title: string;
  items: { item: string; unit?: string | null }[];
};

function cleanText(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/[•·]/g, " ")
    .trim();
}

function normalizeUnit(label: string, unit?: string | null): string | null {
  if (unit && unit.trim()) return unit.trim();

  const lower = label.toLowerCase();
  if (/\bpsi\b/.test(lower)) return "psi";
  if (/\bkpa\b/.test(lower)) return "kPa";
  if (/\bmm\b/.test(lower)) return "mm";
  if (/\bin\b/.test(lower)) return "in";
  if (/ft.?lb/i.test(label)) return "ft·lb";

  return null;
}

function shouldDropItem(label: string): boolean {
  const lower = label.toLowerCase();

  if (!lower) return true;
  if (lower === "psi" || lower === "kpa" || lower === "mm" || lower === "32") return true;
  if (/^page\s+\d+$/i.test(label)) return true;
  if (/^outside\s*\/\s*inside/i.test(lower)) return true;

  return false;
}

function dedupeItems(items: { item: string; unit?: string | null }[]) {
  const out: { item: string; unit?: string | null }[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const key = item.item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

export function normalizeFleetParseSections(
  sections: FleetParseSection[] | null | undefined,
): FleetParseSection[] {
  if (!Array.isArray(sections)) return [];

  const out: FleetParseSection[] = [];

  for (const section of sections) {
    const title = cleanText(section?.title ?? "") || "Section";
    const rawItems = Array.isArray(section?.items) ? section.items : [];

    const items = rawItems
      .map((row) => {
        const label = cleanText(row?.item ?? "");
        const normalizedUnit = normalizeUnit(label, row?.unit ?? null);

        return {
          item: label,
          unit: normalizedUnit,
        };
      })
      .filter((row) => !shouldDropItem(row.item));

    const deduped = dedupeItems(items);

    if (deduped.length === 0) continue;

    out.push({
      title,
      items: deduped,
    });
  }

  return out;
}
