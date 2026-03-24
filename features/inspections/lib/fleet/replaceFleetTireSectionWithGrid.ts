import { masterInspectionList } from "@/features/inspections/lib/inspection/masterInspectionList";

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

function isExplicitTireSectionTitle(title: string): boolean {
  const t = normalize(title);
  return (
    t === "tire tread depth & pressure" ||
    t === "tire tread depth and pressure" ||
    t === "tire pressure & tread depth" ||
    t === "tire pressure and tread depth" ||
    t === "tires & wheels" ||
    t === "tires and wheels" ||
    t === "tire inspection" ||
    t === "tire checks" ||
    t === "wheel & tire inspection" ||
    t.includes("tire tread") ||
    t.includes("tyre tread") ||
    (t.includes("tire") && t.includes("pressure")) ||
    (t.includes("tire") && t.includes("tread")) ||
    (t.includes("tyre") && t.includes("pressure")) ||
    (t.includes("tyre") && t.includes("tread"))
  );
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

  const explicitTireIndex = source.findIndex((section) =>
    isExplicitTireSectionTitle(section.title),
  );

  if (explicitTireIndex === -1) {
    return source;
  }

  const next = [...source];
  next.splice(explicitTireIndex, 1, canonical);
  return next;
}
