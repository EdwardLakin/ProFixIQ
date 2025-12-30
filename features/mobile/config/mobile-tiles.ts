// features/mobile/config/mobile-tiles.ts

export type MobileRole =
  | "owner"
  | "admin"
  | "manager"
  | "advisor"
  | "mechanic"
  | "parts"
  | "driver"
  | "dispatcher"
  | "fleet_manager";

export type MobileScope =
  | "home"
  | "jobs"
  | "inspect"
  | "messages"
  | "planner" // keep in case something else still references it
  | "settings"
  // align mobile dashboards with desktop views
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
    href: "/mobile/work-orders",
    title: "My Jobs",
    subtitle: "Assigned work orders",
    roles: ["mechanic", "manager", "owner", "admin"],
    scopes: ["home", "jobs", "work_orders", "all"],
  },
  {
    href: "/mobile/inspections",
    title: "Inspections",
    subtitle: "Run checklists on vehicles",
    roles: ["mechanic", "advisor", "manager"],
    scopes: ["home", "inspect", "inspections", "work_orders", "all"],
  },
  // 🔁 Planner → Appointments (mobile day planner)
  {
    href: "/mobile/appointments",
    title: "Appointments",
    subtitle: "Today’s schedule",
    roles: ["mechanic", "manager", "owner", "admin"],
    scopes: ["home", "appointments", "work_orders", "all"],
  },
  {
    href: "/mobile/messages",
    title: "Team Chat",
    subtitle: "Stay in sync",
    roles: ["mechanic", "advisor", "manager", "owner", "admin", "parts"],
    scopes: ["home", "messages", "all"],
  },
  {
    href: "/mobile/settings",
    title: "Settings",
    subtitle: "Account & mobile options",
    roles: ["mechanic", "advisor", "manager", "owner", "admin", "parts"],
    scopes: ["home", "settings", "all"],
  },

  // 🔶 Mobile owner/manager reports
  {
    href: "/mobile/reports",
    title: "Reports",
    subtitle: "Revenue & tech efficiency",
    roles: ["owner", "admin", "manager"],
    scopes: ["home", "work_orders", "all"],
  },

  // 🔧 Mobile technicians / leaderboard
  {
    href: "/mobile/technicians",
    title: "Technicians",
    subtitle: "Roster & performance",
    roles: ["owner", "admin", "manager"],
    scopes: ["home", "jobs", "work_orders", "all"],
  },

  // 🚚 Fleet – management / dispatch view
  {
    href: "/mobile/fleet",
    title: "Fleet",
    subtitle: "Units, issues & routes",
    roles: ["owner", "admin", "manager", "fleet_manager", "dispatcher"],
    scopes: ["home", "fleet", "all"],
  },

  // 📝 Driver daily pre-trip (mobile)
  {
    href: "/mobile/fleet/pretrip",
    title: "Pre-trip",
    subtitle: "Daily vehicle check",
    roles: ["driver"],
    scopes: ["home", "fleet", "inspect", "all"],
  },

  // 👨‍🔧 Mobile tech self performance
  {
    href: "/mobile/tech/performance",
    title: "My Performance",
    subtitle: "Jobs, hours & efficiency",
    roles: ["mechanic", "manager", "owner", "admin"],
    scopes: ["home", "jobs", "all"],
  },

  // 🚨 Fleet service requests (mobile)
  {
    href: "/mobile/fleet/service-requests",
    title: "Service Requests",
    subtitle: "Fleet issues & follow-up",
    roles: ["owner", "admin", "manager", "mechanic", "parts", "fleet_manager", "dispatcher"],
    scopes: ["home", "work_orders", "inspections", "fleet", "all"],
  },
];