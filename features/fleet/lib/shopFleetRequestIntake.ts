import type { CanonicalRole } from "@/features/shared/lib/rbac";

export const SHOP_FLEET_REQUEST_INTAKE_ROLES = [
  "owner",
  "admin",
  "manager",
  "advisor",
] as const satisfies readonly CanonicalRole[];
