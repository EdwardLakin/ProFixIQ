import "server-only";

import { offRoadInspectionCategories } from "@/features/inspections/lib/inspection/offRoadInspectionCatalog";
import { resolveEquipmentAddonEntitlementForShop } from "@/features/equipment/server/equipmentAddonEntitlement";

const OFF_ROAD_SECTION_TITLES = new Set(
  offRoadInspectionCategories.map((section) => section.title.trim().toLowerCase()),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Detect canonical Equipment inspection content independently of browser state.
 * Section titles are retained by the draft editor, while catalog metadata is
 * also recognized when a caller preserves it.
 */
export function inspectionSectionsRequireEquipment(sections: unknown): boolean {
  if (!Array.isArray(sections)) return false;

  return sections.some((section) => {
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
      return Array.isArray(item.equipmentFamilies) && item.equipmentFamilies.length > 0;
    });
  });
}

export async function shopCanMutateInspectionSections(
  shopId: string,
  sections: unknown,
): Promise<boolean> {
  if (!inspectionSectionsRequireEquipment(sections)) return true;
  const entitlement = await resolveEquipmentAddonEntitlementForShop(shopId);
  return entitlement.enabled;
}
