import { EQUIPMENT_DIRECTORY_ROLES } from "@/features/equipment/lib/equipmentDirectory";
import { EQUIPMENT_FIELD_ENTRY_ROLES } from "@/features/equipment/lib/equipmentFieldEntry";
import {
  getActorCapabilities,
  ROLE_GROUPS,
  type CanonicalRole,
} from "@/features/shared/lib/rbac";

export type EquipmentShellItemKey =
  | "dashboard"
  | "work"
  | "dispatch"
  | "field"
  | "assets"
  | "pm"
  | "inspections"
  | "parts"
  | "customers"
  | "billing"
  | "reports"
  | "settings";

export type EquipmentShellChild = {
  label: string;
  href: string;
};

export type EquipmentShellItem = {
  key: EquipmentShellItemKey;
  label: string;
  href: string;
  /**
   * live: an Equipment page that already serves this workflow.
   * planned: the Equipment entry point exists, the Equipment workspace does not
   * yet. The page says so and links to the canonical workspace that serves the
   * workflow today.
   */
  state: "live" | "planned";
  /** Equipment pages that belong under this item and are already live. */
  children?: readonly EquipmentShellChild[];
  /** Planned items only: what the Equipment workspace will own. */
  summary?: string;
  /** Planned items only: the canonical workspace that serves this today. */
  canonical?: { label: string; href: string };
  visibleTo: (role: CanonicalRole) => boolean;
};

const hasRole = (roles: readonly string[]) => (role: CanonicalRole) =>
  roles.includes(role);
// Equipment pages serve the shop-wide directory roles; assigned-work roles
// (mechanics) only get the field entry, so nobody is shown a link that bounces.
const always = hasRole(EQUIPMENT_DIRECTORY_ROLES);

/**
 * Navigation for the standalone Equipment workspace. Equipment's own routes
 * come first; where the workflow still runs in a canonical workspace, the item
 * is `planned` and points at that workspace rather than duplicating its logic.
 * Visibility mirrors the destination's own gate so nobody is sent to a denial.
 *
 * `equipmentSections.ts` remains the registry for the asset-engine landing
 * pages; every one of those pages stays reachable through this registry.
 */
export const EQUIPMENT_SHELL_NAV: readonly EquipmentShellItem[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    href: "/equipment/dashboard",
    state: "live",
    visibleTo: always,
  },
  {
    key: "work",
    label: "Work",
    href: "/equipment/work-orders",
    state: "live",
    visibleTo: always,
  },
  {
    key: "dispatch",
    label: "Dispatch",
    href: "/equipment/dispatch",
    state: "planned",
    summary:
      "One-click dispatch of a technician and service truck to a machine, from the same work order that carries the repair.",
    canonical: { label: "Dispatch board", href: "/dashboard/dispatch" },
    visibleTo: (role) => getActorCapabilities({ role }).canManageScheduling,
  },
  {
    key: "field",
    label: "Field",
    href: "/equipment/field",
    state: "live",
    visibleTo: hasRole(EQUIPMENT_FIELD_ENTRY_ROLES),
  },
  {
    key: "assets",
    label: "Assets",
    href: "/equipment",
    state: "live",
    children: [
      { label: "Components", href: "/equipment/components" },
      { label: "Measurements", href: "/equipment/measurements" },
      { label: "Undercarriage", href: "/equipment/undercarriage" },
      { label: "Fluid analysis", href: "/equipment/fluid-analysis" },
    ],
    visibleTo: always,
  },
  {
    key: "pm",
    label: "PM",
    href: "/equipment/pm",
    state: "live",
    visibleTo: always,
  },
  {
    key: "inspections",
    label: "Inspections",
    href: "/equipment/inspections",
    state: "live",
    visibleTo: always,
  },
  {
    key: "parts",
    label: "Parts",
    href: "/equipment/parts",
    state: "planned",
    summary:
      "Parts requests, holds, purchasing and truck stock for equipment repairs, on the shared parts and inventory records.",
    canonical: { label: "Parts", href: "/parts" },
    visibleTo: (role) => getActorCapabilities({ role }).canManageParts,
  },
  {
    key: "customers",
    label: "Customers",
    href: "/equipment/customers",
    state: "planned",
    summary:
      "The businesses whose machines you repair, their equipment, and portal invitations for service requests, approvals and payment.",
    canonical: { label: "Customers", href: "/customers" },
    visibleTo: always,
  },
  {
    key: "billing",
    label: "Billing",
    href: "/equipment/billing",
    state: "planned",
    summary:
      "Invoices and payments for completed equipment work, on the shared invoice and payment records.",
    canonical: { label: "Billing", href: "/billing" },
    visibleTo: hasRole(ROLE_GROUPS.billingOperators),
  },
  {
    key: "reports",
    label: "Reports",
    href: "/equipment/reports",
    state: "planned",
    summary:
      "Downtime, repair turnaround, PM compliance and technician utilization across machines and customers.",
    canonical: { label: "Reports", href: "/dashboard/owner/reports" },
    visibleTo: hasRole(["owner", "admin", "manager"]),
  },
  {
    key: "settings",
    label: "Settings",
    href: "/equipment/settings",
    state: "planned",
    summary:
      "Equipment business profile, service trucks, users and roles, and portal settings.",
    canonical: { label: "Settings", href: "/dashboard/owner/settings" },
    visibleTo: hasRole(["owner", "admin"]),
  },
];

export function equipmentShellNavForRole(
  role: CanonicalRole,
): EquipmentShellItem[] {
  return EQUIPMENT_SHELL_NAV.filter((item) => item.visibleTo(role));
}

export function equipmentShellItem(key: EquipmentShellItemKey): EquipmentShellItem {
  const item = EQUIPMENT_SHELL_NAV.find((entry) => entry.key === key);
  if (!item) throw new Error(`Unknown Equipment shell item: ${key}`);
  return item;
}

function matchesPath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The item that owns a pathname. /equipment is the Assets root, so it only owns
 * itself plus asset detail pages that no other item claims.
 */
export function activeEquipmentShellKey(
  pathname: string,
): EquipmentShellItemKey | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  for (const item of EQUIPMENT_SHELL_NAV) {
    if (item.key === "assets") continue;
    if (matchesPath(path, item.href)) return item.key;
  }
  const assets = equipmentShellItem("assets");
  if (
    assets.children?.some((child) => matchesPath(path, child.href)) ||
    path === assets.href ||
    path.startsWith(`${assets.href}/`)
  ) {
    return "assets";
  }
  return null;
}
