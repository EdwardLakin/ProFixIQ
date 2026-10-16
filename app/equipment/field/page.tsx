import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";

import EquipmentAccessState from "@/features/equipment/components/EquipmentAccessState";
import {
  EQUIPMENT_FIELD_ENTRY_LINKS,
  EQUIPMENT_FIELD_ENTRY_ROLES,
} from "@/features/equipment/lib/equipmentFieldEntry";
import { resolveEquipmentPageEntitlement } from "@/features/equipment/server/pageEntitlement";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import {
  WorkspaceHeader,
  WorkspaceShell,
  WORKSPACE_EYEBROW as EYEBROW,
  WORKSPACE_PANEL as PANEL,
} from "@/features/workspace/components";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Equipment-branded technician entry, built for a phone or tablet on a
 * jobsite. It reads no business data; each link opens a canonical field
 * surface that applies its own authorization.
 */
export default async function EquipmentFieldPage() {
  noStore();

  const { profile } = await requireShopPageAccess({
    allowRoles: EQUIPMENT_FIELD_ENTRY_ROLES,
  });

  const entitlement = await resolveEquipmentPageEntitlement(profile.shop_id);
  if (entitlement !== "enabled") {
    return <EquipmentAccessState state={entitlement} retryHref="/equipment/field" />;
  }

  return (
    <WorkspaceShell>
      <WorkspaceHeader>
        <p className={EYEBROW}>Equipment</p>
        <h1 className="mt-1 text-2xl font-bold">Field</h1>
        <p className="mt-1 text-sm text-[color:var(--theme-text-muted)]">
          Your jobs, service calls and truck stock for work on the jobsite.
        </p>
      </WorkspaceHeader>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {EQUIPMENT_FIELD_ENTRY_LINKS.map((link) => (
          <li key={link.key}>
            <Link
              href={link.href}
              className={`${PANEL} flex min-h-24 flex-col justify-center gap-1 p-4 transition hover:bg-[color:var(--theme-surface-overlay)]`}
            >
              <span className="text-base font-semibold">{link.label}</span>
              <span className="text-sm text-[color:var(--theme-text-muted)]">
                {link.description}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </WorkspaceShell>
  );
}
