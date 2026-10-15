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
  equipmentOperatingSignal,
  equipmentSection,
  equipmentSectionSignal,
  type EquipmentAssetSectionKey,
  type EquipmentSectionSignal,
} from "@/features/equipment/lib/equipmentSections";
import { loadEquipmentAssetList } from "@/features/equipment/server/loadEquipmentAssetList";
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
  undercarriage: "Machines with undercarriage components. Open one to review wear against its limits.",
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

  const supabase = createServerSupabaseRSC();
  const admin = createAdminSupabase();
  type Entry = {
    assetId: string;
    title: string;
    subtitle: string;
    signal: EquipmentSectionSignal;
  };
  let entries: Entry[];
  let truncated: boolean;
  if (section === "pm" || section === "inspections") {
    // These two need the directory's PM and inspection evidence.
    const directory = await loadEquipmentDirectory({
      supabase,
      admin,
      shopId: profile.shop_id,
      role: canonicalRole,
    });
    truncated = directory.truncated;
    entries = directory.rows.map((row) => ({
      assetId: row.assetId,
      title: equipmentAssetTitle(row),
      subtitle: [row.equipmentClassLabel, row.customerName, row.siteName].filter(Boolean).join(" · "),
      signal: equipmentSectionSignal(section, row),
    }));
  } else {
    // The rest show operating state only, so skip the work-order, inspection,
    // booking and PM history reads.
    const list = await loadEquipmentAssetList({
      supabase,
      admin,
      shopId: profile.shop_id,
      requireUndercarriage: section === "undercarriage",
    });
    truncated = list.truncated;
    entries = list.rows.map((row) => ({
      assetId: row.assetId,
      title: equipmentAssetTitle(row),
      subtitle: [row.equipmentClassLabel, row.customerName, row.siteName].filter(Boolean).join(" · "),
      signal: equipmentOperatingSignal(row.operatingStatus),
    }));
  }
  entries.sort((a, b) => a.signal.rank - b.signal.rank);

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
        {entries.length === 0 ? (
          <EmptyState>
            No Equipment assets yet. <Link className="underline" href="/equipment">Add one from Assets.</Link>
          </EmptyState>
        ) : (
          <ul className="grid gap-2">
            {entries.map(({ assetId, title, subtitle, signal }) => (
              <li key={assetId}>
                <Link
                  href={equipmentAssetSectionHref(section, assetId)}
                  className={`${PANEL} flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-[color:var(--theme-surface-overlay)]`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{title}</span>
                    <span className="block text-xs text-[color:var(--theme-text-muted)]">{subtitle}</span>
                  </span>
                  <span className={`text-sm font-semibold capitalize ${TONE[signal.tone]}`}>
                    {signal.label}
                  </span>
                </Link>
              </li>
            ))}
            {truncated ? (
              <li className="text-xs text-[color:var(--theme-text-muted)]">
                Showing the {entries.length} most recently updated assets. Older assets are not
                listed here yet, so ordering applies to this list only.
              </li>
            ) : null}
          </ul>
        )}
      </WorkspaceShell>
    </>
  );
}
