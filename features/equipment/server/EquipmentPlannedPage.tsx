import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

import EquipmentAccessState from "@/features/equipment/components/EquipmentAccessState";
import { EQUIPMENT_DIRECTORY_ROLES } from "@/features/equipment/lib/equipmentDirectory";
import {
  equipmentShellItem,
  type EquipmentShellItemKey,
} from "@/features/equipment/lib/equipmentShellNav";
import { resolveEquipmentPageEntitlement } from "@/features/equipment/server/pageEntitlement";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import {
  WorkspaceHeader,
  WorkspaceShell,
  WORKSPACE_EYEBROW as EYEBROW,
  WORKSPACE_PANEL as PANEL,
} from "@/features/workspace/components";

/**
 * Entry point for an Equipment workflow whose Equipment workspace is not built
 * yet. It owns the route, the navigation slot and the access gate, and points
 * at the canonical workspace that serves the workflow today. It reads no
 * business data and creates nothing, so there is no second implementation of
 * work orders, parts, invoices or scheduling to drift from the canonical one.
 */
export default async function EquipmentPlannedPage({
  itemKey,
}: {
  itemKey: Exclude<EquipmentShellItemKey, "dashboard">;
}) {
  noStore();

  const item = equipmentShellItem(itemKey);
  const { profile, canonicalRole } = await requireShopPageAccess({
    allowRoles: EQUIPMENT_DIRECTORY_ROLES,
  });

  // Same gate the canonical destination applies, so nobody lands on a denial.
  if (!item.visibleTo(canonicalRole)) redirect("/equipment/dashboard");

  const entitlement = await resolveEquipmentPageEntitlement(profile.shop_id);
  if (entitlement !== "enabled") {
    return <EquipmentAccessState state={entitlement} retryHref={item.href} />;
  }

  return (
    <WorkspaceShell>
      <WorkspaceHeader>
        <p className={EYEBROW}>Equipment</p>
        <h1 className="mt-1 text-2xl font-bold">{item.label}</h1>
        {item.summary ? (
          <p className="mt-1 text-sm text-[color:var(--theme-text-muted)]">
            {item.summary}
          </p>
        ) : null}
      </WorkspaceHeader>

      <section className={`${PANEL} flex flex-col gap-3 p-4`} aria-label="Availability">
        <h2 className="text-sm font-semibold">Coming to the Equipment workspace</h2>
        <p className="text-sm text-[color:var(--theme-text-muted)]">
          The Equipment {item.label.toLowerCase()} workspace is not available yet. Until it is,
          this work continues in the shared ProFixIQ workspace, on the same records.
        </p>
        {item.canonical ? (
          <Link
            href={item.canonical.href}
            className="inline-flex min-h-11 w-fit items-center rounded-lg border border-[color:var(--theme-border-soft)] px-4 py-2 text-sm font-semibold transition hover:bg-[color:var(--theme-surface-overlay)]"
          >
            Continue in {item.canonical.label} ↗
          </Link>
        ) : null}
      </section>
    </WorkspaceShell>
  );
}
