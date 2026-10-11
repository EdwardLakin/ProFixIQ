import "server-only";

import { inspectionSectionsRequireEquipment } from "@/features/equipment/lib/equipmentInspectionContent";
import { resolveEquipmentAddonEntitlementForShop } from "@/features/equipment/server/equipmentAddonEntitlement";

export { inspectionSectionsRequireEquipment } from "@/features/equipment/lib/equipmentInspectionContent";

export async function shopCanMutateInspectionSections(
  shopId: string,
  sections: unknown,
): Promise<boolean> {
  if (!inspectionSectionsRequireEquipment(sections)) return true;
  const entitlement = await resolveEquipmentAddonEntitlementForShop(shopId);
  return entitlement.enabled;
}
