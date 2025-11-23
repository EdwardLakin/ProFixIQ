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
  | "settings";

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
    scopes: ["home", "jobs"],
  },
  {
    href: "/mobile/inspections",
    title: "Inspections",
    subtitle: "Run checklists on vehicles",
    roles: ["mechanic", "advisor", "manager"],
    scopes: ["home", "inspect"],
  },
  {
    href: "/mobile/planner",
    title: "Today’s Planner",
    subtitle: "Your schedule",
    roles: ["mechanic", "manager", "owner", "admin"],
    scopes: ["home", "planner"],
  },
  {
    href: "/mobile/messages",
    title: "Team Chat",
    subtitle: "Stay in sync",
    roles: ["mechanic", "advisor", "manager", "owner", "admin", "parts"],
    scopes: ["home", "messages"],
  },
  {
    href: "/mobile/settings",
    title: "Settings & Time",
    subtitle: "Punch in/out, account",
    roles: ["mechanic", "advisor", "manager", "owner", "admin", "parts"],
    scopes: ["home", "settings"],
  },
];