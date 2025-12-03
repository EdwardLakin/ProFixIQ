// features/mobile/config/mobile-tiles.ts
export type MobileRole =
  | "owner"
  | "admin"
  | "manager"
  | "advisor"
  | "mechanic"
  | "parts";

export type MobileScope =
  | "home"
  | "jobs"
  | "inspect"
  | "messages"
  | "planner"
  | "settings"
  // extra scopes so mobile dashboards can align with desktop views
  | "work_orders"
  | "appointments"
  | "inspections"
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
    scopes: [
      "home",
      "jobs",
      "work_orders",
      "all", // show up for generic "all" scoped hubs
    ],
  },
  {
    href: "/mobile/inspections",
    title: "Inspections",
    subtitle: "Run checklists on vehicles",
    roles: ["mechanic", "advisor", "manager"],
    scopes: [
      "home",
      "inspect",
      "inspections",
      "work_orders",
      "all",
    ],
  },
  {
    href: "/mobile/planner",
    title: "Today’s Planner",
    subtitle: "Your schedule",
    roles: ["mechanic", "manager", "owner", "admin"],
    scopes: [
      "home",
      "planner",
      "appointments",
      "all",
    ],
  },
  {
    href: "/mobile/messages",
    title: "Team Chat",
    subtitle: "Stay in sync",
    roles: ["mechanic", "advisor", "manager", "owner", "admin", "parts"],
    scopes: [
      "home",
      "messages",
      "all",
    ],
  },
  {
    href: "/mobile/settings",
    title: "Settings",
    subtitle: "Account & mobile options",
    roles: ["mechanic", "advisor", "manager", "owner", "admin", "parts"],
    scopes: [
      "home",
      "settings",
      "all",
    ],
  },

  // 🔶 Mobile owner/manager reports
  {
    href: "/mobile/reports",
    title: "Reports",
    subtitle: "Revenue & tech efficiency",
    roles: ["owner", "admin", "manager"],
    scopes: [
      "home",
      "work_orders",
      "all",
    ],
  },
];