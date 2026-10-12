import "server-only";

import { resolveEquipmentAddonEntitlementForShop } from "@/features/equipment/server/equipmentAddonEntitlement";

export type EquipmentPageEntitlement = "enabled" | "disabled" | "error";

/** Fail-closed Equipment entitlement for server-rendered pages. */
export async function resolveEquipmentPageEntitlement(
  shopId: string,
): Promise<EquipmentPageEntitlement> {
  try {
    const entitlement = await resolveEquipmentAddonEntitlementForShop(shopId);
    return entitlement.enabled ? "enabled" : "disabled";
  } catch (error) {
    console.error("[equipment/page] entitlement failed", { shopId, error });
    return "error";
  }
}
