// features/mobile/config/mobile-tiles.ts
import type { CanonicalRole } from "@/features/shared/lib/rbac";

export type MobileRole = Extract<
  CanonicalRole,
  | "owner"
  | "admin"
  | "manager"
  | "advisor"
  | "mechanic"
  | "lead_hand"
  | "foreman"
  | "parts"
  | "driver"
  | "dispatcher"
  | "fleet_manager"
>;

export type MobileScope =
  | "dashboard"
  | "home"
  | "jobs"
  | "inspect"
  | "messages"
  | "planner"
  | "settings"
  | "work_orders"
  | "appointments"
  | "inspections"
  | "fleet"
  | "all";

export type MobileTile = {
  href: string;
  title: string;
  subtitle?: string;
  roles: MobileRole[];
  scopes: MobileScope[];
};

export const MOBILE_TILES: MobileTile[] = [
  {
    href: "/mobile",
    title: "Shop Overview",
    subtitle: "Today at a glance",
    roles: ["owner", "admin", "manager", "advisor", "mechanic", "lead_hand", "foreman", "parts", "dispatcher", "fleet_manager", "driver"],
    scopes: ["dashboard", "home", "all"],
  },
  {
    href: "/mobile/work-orders",
    title: "Work Order Board",
    subtitle: "Live work flow",
    roles: ["owner", "admin", "manager", "advisor", "lead_hand", "foreman"],
    scopes: ["dashboard", "home", "jobs", "work_orders", "all"],
  },
  {
    href: "/mobile/workforce/attendance",
    title: "Attendance & Activity",
    subtitle: "Live staff and job time",
    roles: ["owner", "admin", "manager"],
    scopes: ["dashboard", "home", "work_orders", "all"],
  },
  {
    href: "/mobile/dispatch",
    title: "Dispatch",
    subtitle: "Technicians, bays and blockers",
    roles: ["manager", "lead_hand", "foreman", "dispatcher"],
    scopes: ["dashboard", "home", "jobs", "work_orders", "all"],
  },
  {
    href: "/mobile/parts",
    title: "Parts",
    subtitle: "Requests, orders and receiving",
    roles: ["parts", "owner", "admin", "manager"],
    scopes: ["dashboard", "home", "jobs", "work_orders", "all"],
  },
  {
    href: "/mobile/tech/queue",
    title: "My Jobs",
    subtitle: "Assigned work orders",
    roles: ["mechanic"],
    scopes: ["home", "jobs", "work_orders", "all"],
  },
  {
    href: "/mobile/inspections",
    title: "Inspections",
    subtitle: "Run checklists on vehicles",
    roles: ["mechanic", "advisor", "manager", "lead_hand", "foreman"],
    scopes: ["home", "inspect", "inspections", "work_orders", "all"],
  },
  {
    href: "/mobile/appointments",
    title: "Appointments",
    subtitle: "Today’s schedule",
    roles: ["advisor", "manager", "lead_hand", "foreman", "owner", "admin"],
    scopes: ["home", "appointments", "work_orders", "all"],
  },
  {
    href: "/mobile/messages",
    title: "Team Chat",
    subtitle: "Stay in sync",
    roles: ["mechanic", "advisor", "manager", "lead_hand", "foreman", "owner", "admin", "parts"],
    scopes: ["home", "messages", "all"],
  },
  {
    href: "/mobile/settings",
    title: "Settings",
    subtitle: "Account & mobile options",
    roles: ["mechanic", "advisor", "manager", "lead_hand", "owner", "admin", "parts"],
    scopes: ["home", "settings", "all"],
  },
  {
    href: "/mobile/reports",
    title: "Reports",
    subtitle: "Revenue & tech efficiency",
    roles: ["owner", "admin", "manager"],
    scopes: ["home", "work_orders", "all"],
  },
  {
    href: "/mobile/technicians",
    title: "Technicians",
    subtitle: "Roster & performance",
    roles: ["owner", "admin", "manager"],
    scopes: ["home", "jobs", "work_orders", "all"],
  },
  {
    href: "/mobile/fleet",
    title: "Fleet",
    subtitle: "Units, issues & routes",
    roles: ["owner", "admin", "manager", "fleet_manager", "dispatcher"],
    scopes: ["home", "fleet", "all"],
  },
  {
    href: "/mobile/fleet/pretrip",
    title: "Pre-trip",
    subtitle: "Daily vehicle check",
    roles: ["driver"],
    scopes: ["home", "fleet", "inspect", "all"],
  },
  {
    href: "/mobile/tech/performance",
    title: "My Performance",
    subtitle: "Jobs, hours & efficiency",
    roles: ["mechanic"],
    scopes: ["home", "jobs", "all"],
  },
  {
    href: "/mobile/fleet/service-requests",
    title: "Service Requests",
    subtitle: "Fleet issues & follow-up",
    roles: ["owner", "admin", "manager", "lead_hand", "mechanic", "parts", "fleet_manager", "dispatcher"],
    scopes: ["home", "work_orders", "inspections", "fleet", "all"],
  },
];

export function getMobileTilesForRole(
  role: MobileRole,
  scopes: MobileScope[] = ["home"],
): MobileTile[] {
  return MOBILE_TILES.filter(
    (tile) =>
      tile.roles.includes(role) &&
      tile.scopes.some((scope) => scopes.includes(scope)),
  );
}
