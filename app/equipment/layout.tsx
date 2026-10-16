import type { ReactNode } from "react";

import EquipmentShell, {
  type EquipmentShellNavItem,
} from "@/features/equipment/components/EquipmentShell";
import { equipmentShellNavForRole } from "@/features/equipment/lib/equipmentShellNav";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import { requireActiveDemoAccessForPage } from "@/features/shared/lib/server/admin-access";

/**
 * Standalone Equipment product shell. This layout only shapes navigation; it
 * grants nothing. Every page below still authenticates, enforces its own role
 * and entitlement gate, and scopes its data to the caller's shop.
 */
export default async function EquipmentLayout({
  children,
}: {
  children: ReactNode;
}) {
  const profile = await requireActiveDemoAccessForPage();
  if (!profile) return <>{children}</>;

  const role = getActorCapabilities({ role: profile.role }).canonicalRole;
  const items: EquipmentShellNavItem[] = equipmentShellNavForRole(role).map(
    ({ key, label, href, state, children: subItems }) => ({
      key,
      label,
      href,
      state,
      children: subItems,
    }),
  );

  return <EquipmentShell items={items}>{children}</EquipmentShell>;
}
