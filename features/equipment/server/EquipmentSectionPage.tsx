import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";

import EquipmentAccessState from "@/features/equipment/components/EquipmentAccessState";
import EquipmentSectionNav from "@/features/equipment/components/EquipmentSectionNav";
import {
  EQUIPMENT_DIRECTORY_ROLES,
  equipmentAssetTitle,
} from "@/features/equipment/lib/equipmentDirectory";
import {
  equipmentAssetSectionHref,
  equipmentSection,
  equipmentSectionSignal,
  type EquipmentAssetSectionKey,
} from "@/features/equipment/lib/equipmentSections";
import { loadEquipmentDirectory } from "@/features/equipment/server/loadEquipmentDirectory";
import { resolveEquipmentPageEntitlement } from "@/features/equipment/server/pageEntitlement";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import {
  createAdminSupabase,
  createServerSupabaseRSC,
} from "@/features/shared/lib/supabase/server";
import {
  WorkspaceEmptyState as EmptyState,
  WorkspaceHeader,
  WorkspaceShell,
  WORKSPACE_EYEBROW as EYEBROW,
  WORKSPACE_PANEL as PANEL,
} from "@/features/workspace/components";

const SECTION_COPY: Record<EquipmentAssetSectionKey, string> = {
  pm: "Preventive maintenance by machine, most urgent first. Plans, completions and linked work orders live on each asset.",
  inspections: "Latest completed inspection per machine, failed findings first.",
  components: "Choose a machine to manage its tracked components, service and replacement history.",
  measurements: "Choose a machine to record and review wear measurements.",
  undercarriage: "Choose a tracked machine to review undercarriage wear against its limits. Machines without undercarriage components show no panel.",
  "fluid-analysis": "Choose a machine to log and review fluid samples.",
};

const TONE = {
  bad: "text-red-400",
  warn: "text-amber-400",
  good: "text-emerald-400",
  muted: "text-[color:var(--theme-text-muted)]",
} as const;

/**
 * Cross-asset landing for a per-asset Equipment engine. It reads the same
 * directory read model as /equipment and links into the asset's own panel,
 * so no second summary or mutation path exists.
 */
export default async function EquipmentSectionPage({
  section,
}: {
  section: EquipmentAssetSectionKey;
}) {
  noStore();
  const definition = equipmentSection(section);

  const { profile, canonicalRole } = await requireShopPageAccess({
    allowRoles: EQUIPMENT_DIRECTORY_ROLES,
  });

  const entitlement = await resolveEquipmentPageEntitlement(profile.shop_id);
  if (entitlement !== "enabled") {
    return <EquipmentAccessState state={entitlement} retryHref={definition.href} />;
  }

  const directory = await loadEquipmentDirectory({
    supabase: createServerSupabaseRSC(),
    admin: createAdminSupabase(),
    shopId: profile.shop_id,
    role: canonicalRole,
  });

  const rows = directory.rows
    .map((row) => ({ row, signal: equipmentSectionSignal(section, row) }))
    .sort((a, b) => a.signal.rank - b.signal.rank);

  return (
    <>
      <EquipmentSectionNav current={section} role={canonicalRole} />
      <WorkspaceShell>
        <WorkspaceHeader>
          <p className={EYEBROW}>Equipment</p>
          <h1 className="mt-1 text-2xl font-bold">{definition.label}</h1>
          <p className="mt-1 text-sm text-[color:var(--theme-text-muted)]">
            {SECTION_COPY[section]}
          </p>
        </WorkspaceHeader>
        {rows.length === 0 ? (
          <EmptyState>
            No Equipment assets yet. <Link className="underline" href="/equipment">Add one from Assets.</Link>
          </EmptyState>
        ) : (
          <ul className="grid gap-2">
            {rows.map(({ row, signal }) => (
              <li key={row.assetId}>
                <Link
                  href={equipmentAssetSectionHref(section, row.assetId)}
                  className={`${PANEL} flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-[color:var(--theme-surface-overlay)]`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{equipmentAssetTitle(row)}</span>
                    <span className="block text-xs text-[color:var(--theme-text-muted)]">
                      {[row.equipmentClassLabel, row.customerName, row.siteName]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className={`text-sm font-semibold capitalize ${TONE[signal.tone]}`}>
                    {signal.label}
                  </span>
                </Link>
              </li>
            ))}
            {directory.truncated ? (
              <li className="text-xs text-[color:var(--theme-text-muted)]">
                Showing the {rows.length} most recently updated assets. Use Assets to find others.
              </li>
            ) : null}
          </ul>
        )}
      </WorkspaceShell>
    </>
  );
}
