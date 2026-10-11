import { offRoadInspectionCategories } from "@/features/inspections/lib/inspection/offRoadInspectionCatalog";

const OFF_ROAD_SECTION_TITLES = new Set(
  offRoadInspectionCategories.map((section) => section.title.trim().toLowerCase()),
);

const OFF_ROAD_ITEM_LABELS = new Set(
  offRoadInspectionCategories.flatMap((section) =>
    section.items.map((item) => item.item.trim().toLowerCase()),
  ),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Classify canonical Equipment inspection content independently of mutable
 * section titles. Item-level catalog metadata is preferred when present, and
 * exact canonical off-road item labels cover drafts/templates created before
 * that metadata was preserved by the editor.
 */
export function inspectionSectionsRequireEquipment(sections: unknown): boolean {
  // Templates are normally section arrays, but some writers persist a keyed
  // object of sections; classify both shapes.
  const list = Array.isArray(sections)
    ? sections
    : isRecord(sections)
      ? Object.values(sections)
      : null;
  if (!list) return false;

  return list.some((section) => {
    if (!isRecord(section)) return false;

    const title =
      typeof section.title === "string" ? section.title.trim().toLowerCase() : "";
    if (
      OFF_ROAD_SECTION_TITLES.has(title) ||
      title.startsWith("off-road —") ||
      title.startsWith("off-road -")
    ) {
      return true;
    }

    if (!Array.isArray(section.items)) return false;
    return section.items.some((item) => {
      if (!isRecord(item)) return false;
      if (String(item.catalogScope ?? "").trim().toLowerCase() === "off_road") {
        return true;
      }
      if (Array.isArray(item.equipmentFamilies) && item.equipmentFamilies.length > 0) {
        return true;
      }
      const label =
        typeof item.item === "string" ? item.item.trim().toLowerCase() : "";
      return Boolean(label) && OFF_ROAD_ITEM_LABELS.has(label);
    });
  });
}
