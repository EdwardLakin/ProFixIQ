import "server-only";

import type { CanonicalRole } from "@/features/shared/lib/rbac";
import {
  getMobileFieldServiceAccess,
  type ShopAccess,
} from "@/features/mobile/service/server/access";

export const SHOP_FLEET_REQUEST_INTAKE_ROLES = [
  "owner",
  "admin",
  "manager",
  "advisor",
] as const satisfies readonly CanonicalRole[];

/**
 * Who may accept a Fleet service request into a Shop work order: the
 * existing desk-side intake roles, or a verified Field operator — a Field
 * Service-entitled shop's enabled operator, or a standalone Field shop's
 * canonical owner. Field is a full operations workspace for a
 * mobile-mechanic business with no separate advisor/manager to hand this
 * off to, so it needs to accept its own requests.
 *
 * This is the single source of truth for that boundary; the database
 * function enforces the same check independently as the real gate, so a
 * caller that slips past this still cannot convert a request it isn't
 * authorized for.
 */
export async function canAcceptFleetServiceRequests(
  access: ShopAccess,
): Promise<boolean> {
  const intakeRoles: readonly string[] = SHOP_FLEET_REQUEST_INTAKE_ROLES;
  if (intakeRoles.includes(access.canonicalRole)) {
    return true;
  }

  const fieldAccess = await getMobileFieldServiceAccess(access).catch(
    () => null,
  );
  return fieldAccess?.canAccessFieldService === true;
}
