import type { ReactNode } from "react";

export type AppDef = {
  slug: string;
  name: string;
  icon: ReactNode;
  route: string;
  badge?: (uid: string) => Promise<number | "dot" | 0>;
  opensIn?: "route" | "panel";
  scope?: "work_orders" | "inspections" | "parts" | "tech" | "management" | "settings" | "all";
  roleGate?: string[];
};

export const APPS: AppDef[] = [
  { slug: "work-orders",  name: "Work Orders",  icon: "🛠️", route: "/work-orders/queue", scope: "work_orders" },
  { slug: "inspections",  name: "Inspections",  icon: "📋", route: "/inspections",        scope: "inspections" },
  { slug: "messages",     name: "Inbox",        icon: "📨", route: "/messages",           scope: "all" },
  { slug: "appointments", name: "Appointments", icon: "📆", route: "/appointments",       scope: "management" },
  { slug: "tech-assistant", name: "Tech Assistant", icon: "🤖", route: "/tech/assistant", scope: "tech" },
];

export const appsBySlug = Object.fromEntries(APPS.map(a => [a.slug, a]));
