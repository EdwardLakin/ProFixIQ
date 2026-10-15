import type { EquipmentDirectoryRow } from "@/features/equipment/lib/equipmentDirectory";
import { getActorCapabilities, ROLE_GROUPS, type CanonicalRole } from "@/features/shared/lib/rbac";

export type EquipmentSectionKey =
  | "assets"
  | "work-orders"
  | "pm"
  | "inspections"
  | "components"
  | "measurements"
  | "undercarriage"
  | "fluid-analysis"
  | "scheduling"
  | "parts"
  | "billing"
  | "reports"
  | "settings";

/** Per-asset engines get an Equipment landing page that deep-links into the asset's own panel. */
export type EquipmentAssetSectionKey = Extract<
  EquipmentSectionKey,
  "pm" | "inspections" | "components" | "measurements" | "undercarriage" | "fluid-analysis"
>;

export type EquipmentSection = {
  key: EquipmentSectionKey;
  label: string;
  href: string;
  /** Opens a canonical shop surface outside /equipment instead of an Equipment page. */
  external?: boolean;
  /** Anchor of the shared engine panel on /equipment/[assetId]. */
  assetAnchor?: string;
  visibleTo: (role: CanonicalRole) => boolean;
};

const always = () => true;
const hasRole = (roles: readonly string[]) => (role: CanonicalRole) => roles.includes(role);

/**
 * Single navigation registry for the Equipment workspace. Equipment pages are
 * always visible to roles that can browse the directory; links out to shop
 * surfaces mirror the destination's own gate so nobody is sent to a denial.
 * (Dashboard is added with the Equipment dashboard.)
 */
export const EQUIPMENT_SECTIONS: readonly EquipmentSection[] = [
  { key: "assets", label: "Assets", href: "/equipment", visibleTo: always },
  { key: "work-orders", label: "Work Orders", href: "/equipment/work-orders", visibleTo: always },
  { key: "pm", label: "PM", href: "/equipment/pm", assetAnchor: "asset-pm", visibleTo: always },
  {
    key: "inspections",
    label: "Inspections",
    href: "/equipment/inspections",
    assetAnchor: "asset-defects",
    visibleTo: always,
  },
  {
    key: "components",
    label: "Components",
    href: "/equipment/components",
    assetAnchor: "asset-components",
    visibleTo: always,
  },
  {
    key: "measurements",
    label: "Measurements",
    href: "/equipment/measurements",
    assetAnchor: "asset-measurements",
    visibleTo: always,
  },
  {
    key: "undercarriage",
    label: "Undercarriage",
    href: "/equipment/undercarriage",
    assetAnchor: "asset-undercarriage",
    visibleTo: always,
  },
  {
    key: "fluid-analysis",
    label: "Fluid Analysis",
    href: "/equipment/fluid-analysis",
    assetAnchor: "asset-fluid-samples",
    visibleTo: always,
  },
  {
    key: "scheduling",
    label: "Scheduling",
    href: "/dashboard/appointments",
    external: true,
    visibleTo: (role) => getActorCapabilities({ role }).canManageScheduling,
  },
  {
    key: "parts",
    label: "Parts",
    href: "/parts",
    external: true,
    visibleTo: (role) => getActorCapabilities({ role }).canManageParts,
  },
  {
    key: "billing",
    label: "Billing",
    href: "/billing",
    external: true,
    visibleTo: hasRole(ROLE_GROUPS.billingOperators),
  },
  {
    key: "reports",
    label: "Reports",
    href: "/dashboard/owner/reports",
    external: true,
    visibleTo: hasRole(["owner", "admin", "manager"]),
  },
  {
    key: "settings",
    label: "Settings",
    href: "/dashboard/owner/settings",
    external: true,
    visibleTo: hasRole(["owner", "admin"]),
  },
];

export function equipmentSectionsForRole(role: CanonicalRole): EquipmentSection[] {
  return EQUIPMENT_SECTIONS.filter((section) => section.visibleTo(role));
}

export function equipmentSection(key: EquipmentSectionKey): EquipmentSection {
  const section = EQUIPMENT_SECTIONS.find((entry) => entry.key === key);
  if (!section) throw new Error(`Unknown Equipment section: ${key}`);
  return section;
}

/** Deep link into one asset's panel for a per-asset engine section. */
export function equipmentAssetSectionHref(key: EquipmentAssetSectionKey, assetId: string): string {
  const anchor = equipmentSection(key).assetAnchor;
  return `/equipment/${assetId}${anchor ? `#${anchor}` : ""}`;
}

export type EquipmentSectionSignal = {
  /** Lower sorts first (needs attention). */
  rank: number;
  label: string;
  tone: "bad" | "warn" | "good" | "muted";
};

const PM_RANK = { overdue: 0, due: 1, not_evaluated: 3, ok: 2 } as const;

/**
 * The one fact from the shared directory row that matters for this section.
 * Engines without a fleet-level read model (components, measurements,
 * undercarriage, fluids) show the machine's operating state instead of an
 * invented summary.
 */
export function equipmentSectionSignal(
  key: EquipmentAssetSectionKey,
  row: Pick<EquipmentDirectoryRow, "pm" | "inspection" | "openDefects" | "operatingStatus">,
): EquipmentSectionSignal {
  if (key === "pm") {
    const labels = { overdue: "PM overdue", due: "PM due", ok: "PM up to date", not_evaluated: "PM not evaluated" } as const;
    const tone = { overdue: "bad", due: "warn", ok: "good", not_evaluated: "muted" } as const;
    return {
      rank: PM_RANK[row.pm.state],
      label: row.pm.dueCount ? `${labels[row.pm.state]} · ${row.pm.dueCount}` : labels[row.pm.state],
      tone: tone[row.pm.state],
    };
  }
  if (key === "inspections") {
    if (row.inspection.state === "findings") {
      return {
        rank: row.openDefects.failed ? 0 : 1,
        label: row.openDefects.failed
          ? `${row.openDefects.total} findings (${row.openDefects.failed} failed)`
          : `${row.openDefects.total} findings`,
        tone: row.openDefects.failed ? "bad" : "warn",
      };
    }
    return row.inspection.state === "clear"
      ? { rank: 3, label: "No findings", tone: "good" }
      : { rank: 2, label: "No inspection recorded", tone: "muted" };
  }
  const down = row.operatingStatus === "down" || row.operatingStatus === "out_of_service";
  return {
    rank: down ? 0 : 1,
    label: row.operatingStatus.replace(/_/g, " "),
    tone: down ? "bad" : "muted",
  };
}
