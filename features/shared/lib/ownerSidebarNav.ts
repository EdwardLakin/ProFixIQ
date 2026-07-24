import type { Tile } from "@/features/shared/config/tiles";

export const OWNER_GROUP_ORDER = [
  "Dashboard",
  "Operations",
  "Parts",
  "Fleet",
  "Property",
  "Inspections & Menu",
  "Workforce",
  "Growth",
  "Billing & Plan",
  "Settings",
  "Technician Tools",
  "General",
];

const OWNER_SECTION_OVERRIDES_BY_HREF: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/owner/reports": "Dashboard",
  "/dashboard/performance": "Dashboard",
  "/work-orders/board": "Dashboard",
  "/dashboard/workforce/attendance": "Workforce",
  "/work-orders/create?autostart=1": "Operations",
  "/work-orders/view": "Operations",
  "/work-orders/quote-review": "Operations",
  "/customers/search": "Operations",
  "/customers/directory": "Operations",
  "/vehicles": "Operations",
  "/billing": "Operations",
  "/work-orders/history": "Operations",
  "/parts": "Parts",
  "/parts/requests": "Parts",
  "/parts/receiving": "Parts",
  "/parts/receive": "Parts",
  "/parts/inventory": "Parts",
  "/parts/po": "Parts",
  "/parts/po/receive": "Parts",
  "/parts/movements": "Parts",
  "/parts/allocations": "Parts",
  "/parts/vendors": "Parts",
  "/fleet/tower": "Fleet",
  "/fleet/dispatch": "Operations",
  "/fleet/units": "Fleet",
  "/fleet/units/new": "Fleet",
  "/fleet/programs": "Fleet",
  "/property": "Property",
  "/property/setup": "Property",
  "/menu": "Inspections & Menu",
  "/inspections/custom-inspection": "Inspections & Menu",
  "/inspections/templates": "Inspections & Menu",
  "/inspections/fleet-import": "Inspections & Menu",
  "/inspections/saved": "Inspections & Menu",
  "/dashboard/workforce": "Workforce",
  "/dashboard/onboarding-v2": "Settings",
  "/dashboard/admin/shops": "Settings",
  "/dashboard/marketing": "Growth",
  "/dashboard/reviews": "Growth",
  "/compare-plans": "Billing & Plan",
  "/dashboard/owner/payments": "Billing & Plan",
  "/dashboard/owner/settings": "Settings",
  "/dashboard/tech/settings": "Settings",
  "/tech/queue": "Technician Tools",
  "/parts/requests?mine=1": "Technician Tools",
  "/chat": "Technician Tools",
};

const OWNER_TITLE_OVERRIDES_BY_HREF: Record<string, string> = {
  "/work-orders/view": "Work Orders",
  "/billing": "Customer Billing",
  "/parts/requests": "Parts Requests",
};

export function getOwnerTileOverrides(tile: Tile): Pick<Tile, "section" | "title"> {
  if (tile.href === "/dashboard/appointments" && tile.title === "Scheduling") {
    return { section: "People & Workforce", title: tile.title };
  }

  return {
    section: OWNER_SECTION_OVERRIDES_BY_HREF[tile.href] ?? tile.section,
    title: OWNER_TITLE_OVERRIDES_BY_HREF[tile.href] ?? tile.title,
  };
}

export function getOwnerSidebarTiles(tiles: Tile[]): Tile[] {
  return tiles.map((tile) => ({ ...tile, ...getOwnerTileOverrides(tile) }));
}
