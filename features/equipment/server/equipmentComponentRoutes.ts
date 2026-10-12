import "server-only";

import { NextResponse } from "next/server";

import { resolveEquipmentAddonEntitlementForShop } from "@/features/equipment/server/equipmentAddonEntitlement";
import { EquipmentAssetProfileError } from "@/features/equipment/server/equipmentAssetProfileService";
import { EquipmentComponentError } from "@/features/equipment/server/equipmentComponentService";

const NO_STORE = { "Cache-Control": "private, no-store" };


export function componentJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/** null = entitled; otherwise the response to return. */
export async function componentEntitlementFailure(shopId: string, forWrite: boolean) {
  try {
    const entitlement = await resolveEquipmentAddonEntitlementForShop(shopId);
    if (entitlement.enabled) return null;
    return forWrite
      ? componentJson({ error: "An active Equipment subscription is required." }, 403)
      : componentJson({ entitled: false });
  } catch (error) {
    console.error("[equipment/components] entitlement failed", { shopId, error });
    return componentJson({ error: "Equipment entitlement could not be verified. Try again." }, 503);
  }
}

export function componentServiceFailure(error: unknown) {
  if (error instanceof EquipmentComponentError || error instanceof EquipmentAssetProfileError) {
    return componentJson({ error: error.message }, error.status);
  }
  console.error("[equipment/components] unexpected failure", error);
  return componentJson({ error: "The component request could not be processed." }, 500);
}
