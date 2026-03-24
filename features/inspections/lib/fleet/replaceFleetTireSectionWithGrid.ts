import { masterInspectionList } from "@/features/inspections/lib/masterInspectionList";

export type FleetEditableItem = {
  item: string;
  unit?: string | null;
};

export type FleetEditableSection = {
  title: string;
  items: FleetEditableItem[];
};

type DutyClass = "light" | "medium" | "heavy";

function normalize(value: string): string {
  return (value || "").trim().toLowerCase();
}

function isTireLikeTitle(title: string): boolean {
  const t = normalize(title);
  return (
    t.includes("tire tread") ||
    t.includes("tyre tread") ||
    t.includes("tread depth") ||
    t.includes("tire pressure") ||
    t.includes("tyre pressure") ||
    (t.includes("tire") && t.includes("pressure")) ||
    (t.includes("tire") && t.includes("tread"))
  );
}

function isTireLikeItem(label: string): boolean {
  const l = normalize(label);
  return (
    l.includes("tire pressure") ||
    l.includes("tyre pressure") ||
    l.includes("pressure") ||
    l.includes("tread depth") ||
    l.includes("tread") ||
    l.includes("sidewall") ||
    l.includes("wheel hub") ||
    l.includes("wheel rim") ||
    l.includes("wheel fasteners") ||
    l.includes("psi") ||
    l.includes("/32")
  );
}

function isRawImportedTireSection(section: FleetEditableSection): boolean {
  if (isTireLikeTitle(section.title)) return true;

  const tireHits = (section.items ?? []).filter((item) =>
    isTireLikeItem(item.item || ""),
  ).length;

  return tireHits >= 2;
}

function findCanonicalTireGridSection(
  vehicleType: string,
  dutyClass: DutyClass | "",
): FleetEditableSection | null {
  const vt = normalize(vehicleType);
  const isAir = dutyClass === "heavy" || vt === "bus" || vt === "trailer";

  const wantedTitle = isAir
    ? "Tire Grid — Air Brake (HD)"
    : "Tire Grid — Hydraulic";

  const found = masterInspectionList.find(
    (section) => section.title.trim() === wantedTitle,
  );

  if (!found) return null;

  return {
    title: found.title,
    items: found.items.map((item) => ({
      item: item.item,
      unit: item.unit ?? null,
    })),
  };
}

function hasCanonicalTireGrid(sections: FleetEditableSection[]): boolean {
  return sections.some((section) => normalize(section.title).includes("tire grid"));
}

function findInsertIndex(sections: FleetEditableSection[]): number {
  const tiresAndWheelsIndex = sections.findIndex(
    (section) => normalize(section.title) === "tires & wheels",
  );
  if (tiresAndWheelsIndex >= 0) return tiresAndWheelsIndex;

  const firstRawTireIndex = sections.findIndex(isRawImportedTireSection);
  if (firstRawTireIndex >= 0) return firstRawTireIndex;

  return 0;
}

export function replaceFleetTireSectionWithGrid(params: {
  sections: FleetEditableSection[];
  vehicleType?: string;
  dutyClass?: DutyClass | "";
}): FleetEditableSection[] {
  const source = Array.isArray(params.sections) ? params.sections : [];
  if (source.length === 0) return source;

  if (hasCanonicalTireGrid(source)) {
    return source;
  }

  const canonical = findCanonicalTireGridSection(
    params.vehicleType ?? "",
    params.dutyClass ?? "",
  );
  if (!canonical) return source;

  const withoutRawTireSections = source.filter(
    (section) => !isRawImportedTireSection(section),
  );

  const insertAt = Math.min(
    findInsertIndex(source),
    withoutRawTireSections.length,
  );

  return [
    ...withoutRawTireSections.slice(0, insertAt),
    canonical,
    ...withoutRawTireSections.slice(insertAt),
  ];
}
