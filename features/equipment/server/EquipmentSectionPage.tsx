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
import EquipmentPager from "@/features/equipment/components/EquipmentPager";
import {
  EVIDENCE_SCAN_MAX_ASSETS,
  applyIdentityFilters,
  directoryQueryString,
  paginate,
  parseDirectoryFilters,
} from "@/features/equipment/lib/equipmentDirectoryQuery";
import { loadEquipmentAssetList } from "@/features/equipment/server/loadEquipmentAssetList";
import { loadScoredRows } from "@/features/equipment/server/loadEquipmentDirectoryPage";
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
 * so no second summary or mutation path exists. Every asset is reachable:
 * the list is searchable and paged on the server.
 */
export default async function EquipmentSectionPage({
  section,
  searchParams,
}: {
  section: EquipmentAssetSectionKey;
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  noStore();
  const definition = equipmentSection(section);
  const filters = parseDirectoryFilters(searchParams ?? {});

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

  // Identity for the whole shop; search narrows it. Undercarriage keeps only
  // machines that have undercarriage components.
  const index = await loadEquipmentAssetList({
    supabase,
    admin,
    shopId: profile.shop_id,
    requireUndercarriage: section === "undercarriage",
  });
  const candidates = applyIdentityFilters(index.rows, { q: filters.q, equipmentClass: "", status: "", customerId: "" });

  let entries: Entry[];
  let evidencePartial = false;
  if (section === "pm" || section === "inspections") {
    // Ordering by urgency needs PM / inspection evidence for every candidate,
    // so score the (bounded) set, order it, then page it.
    const scanned = candidates.slice(0, EVIDENCE_SCAN_MAX_ASSETS);
    evidencePartial = candidates.length > EVIDENCE_SCAN_MAX_ASSETS;
    const rows = await loadScoredRows({
      supabase,
      admin,
      shopId: profile.shop_id,
      role: canonicalRole,
      assetIds: scanned.map((row) => row.assetId),
    });
    entries = rows.map((row) => ({
      assetId: row.assetId,
      title: equipmentAssetTitle(row),
      subtitle: [row.equipmentClassLabel, row.customerName, row.siteName].filter(Boolean).join(" · "),
      signal: equipmentSectionSignal(section, row),
    }));
  } else {
    entries = candidates.map((row) => ({
      assetId: row.assetId,
      title: equipmentAssetTitle(row),
      subtitle: [row.equipmentClassLabel, row.customerName, row.siteName].filter(Boolean).join(" · "),
      signal: equipmentOperatingSignal(row.operatingStatus),
    }));
  }
  // Stable: assets with equal urgency keep newest-updated first.
  entries.sort((a, b) => a.signal.rank - b.signal.rank);
  const { items, info } = paginate(entries, filters.page);

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
          {index.rows.length > 0 ? (
            <form method="get" action={definition.href} className="mt-3 flex flex-wrap gap-2">
              <input
                className="min-h-10 min-w-0 flex-1 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 text-sm text-[color:var(--theme-text-primary)] outline-none focus:ring-2 focus:ring-[color:var(--accent-copper)]/50"
                type="search"
                name="q"
                defaultValue={filters.q}
                placeholder="Search unit, make, model, serial, customer or site"
                aria-label={`Search ${definition.label}`}
              />
              <button type="submit" className="min-h-10 rounded-lg border border-[color:var(--theme-border-soft)] px-4 text-sm font-semibold">
                Search
              </button>
              {filters.q ? (
                <Link href={definition.href} className="inline-flex min-h-10 items-center rounded-lg border border-[color:var(--theme-border-soft)] px-4 text-sm font-semibold">
                  Clear
                </Link>
              ) : null}
            </form>
          ) : null}
          {index.capped ? (
            <p className="mt-2 text-xs text-amber-400" role="status">
              This shop has more Equipment assets than can be listed, so the oldest are not shown.
            </p>
          ) : null}
          {evidencePartial ? (
            <p className="mt-2 text-xs text-amber-400" role="status">
              Ordered by urgency across the {EVIDENCE_SCAN_MAX_ASSETS.toLocaleString()} most recently
              updated matching assets. Search to narrow the rest.
            </p>
          ) : null}
        </WorkspaceHeader>
        {entries.length === 0 ? (
          <EmptyState>
            {filters.q ? (
              "No assets match this search."
            ) : (
              <>
                No Equipment assets yet. <Link className="underline" href="/equipment">Add one from Assets.</Link>
              </>
            )}
          </EmptyState>
        ) : (
          <>
            <ul className="grid gap-2">
              {items.map(({ assetId, title, subtitle, signal }) => (
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
            </ul>
            <EquipmentPager
              info={info}
              hrefFor={(page) => `${definition.href}${directoryQueryString(filters, { page })}`}
            />
          </>
        )}
      </WorkspaceShell>
    </>
  );
}
