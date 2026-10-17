import "server-only";

import { NextResponse } from "next/server";

import { resolveEquipmentAddonEntitlementForShop } from "@/features/equipment/server/equipmentAddonEntitlement";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

const NO_STORE = { "Cache-Control": "private, no-store" };

export function equipmentJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

type ApiAccessOptions = Parameters<typeof requireShopScopedApiAccess>[0];

/**
 * Staff authentication + shop scope + Equipment entitlement. The capability
 * (office dispatch vs. any assigned technician) is chosen by the caller; the
 * database commands re-authorize the actor and the assignment themselves.
 */
export async function requireEquipmentDispatchAccess(options: ApiAccessOptions = {}) {
  const access = await requireShopScopedApiAccess(options);
  if (!access.ok) return access;

  const entitlement = await resolveEquipmentAddonEntitlementForShop(access.profile.shop_id).catch(
    (error) => {
      console.error("[equipment/dispatch] entitlement failed", error);
      return null;
    },
  );
  if (!entitlement) {
    return {
      ok: false as const,
      response: equipmentJson({ error: "Equipment entitlement could not be verified. Try again." }, 503),
    };
  }
  if (!entitlement.enabled) {
    return {
      ok: false as const,
      response: equipmentJson({ error: "An active Equipment subscription is required." }, 403),
    };
  }
  return access;
}

/** Retries and double taps must reuse one key; creating work needs it. */
export function readOperationKey(request: Request): string | null {
  const key = request.headers.get("Idempotency-Key")?.trim();
  return key && key.length >= 8 && key.length <= 200 ? key : null;
}
