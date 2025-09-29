// features/launcher/registry.tsx
import type { ReactNode } from "react";
import { TILES, type Role, type Scope } from "@/features/shared/components/RoleHubTiles/tiles";

// ---------------- Types ----------------
export type Badge = number | "dot" | 0;

export type AppDef = {
  slug: string;
  name: string;
  icon: ReactNode;
  route: string;
  scope?: Scope | "all";
  roleGate?: Role[];
  badge?: (uid: string) => Promise<Badge>;
  opensIn?: "route" | "panel";
};

// -------------- Helpers ----------------
function iconFor(title: string, href: string): ReactNode {
  const t = title.toLowerCase();
  if (t.includes("create")) return "➕";
  if (t.includes("quote")) return "🧾";
  if (t.includes("history")) return "📜";
  if (t.includes("queue") || t.includes("tech")) return "🚦";
  if (t.includes("inspection")) return "🧰";
  if (t.includes("menu") || t.includes("templates")) return "🗂️";
  if (t.includes("inventory") || href.startsWith("/parts")) return "📦";
  if (t.includes("reports")) return "📈";
  if (t.includes("settings") || t.includes("plan") || t.includes("billing")) return "⚙️";
  if (t.includes("calendar") || t.includes("scheduling") || href.includes("appointments")) return "📆";
  if (t.includes("import")) return "⬇️";
  if (t.includes("returns") || t.includes("warranties")) return "♻️";
  if (t.includes("employees") || t.includes("teams") || t.includes("users") || t.includes("roles")) return "👥";
  if (t.includes("cert")) return "🎓";
  if (t.includes("audit")) return "🔎";
  return "📌";
}

function slugFromHref(href: string): string {
  return href
    .replace(/^\/+/, "")
    .replace(/[^\w/-]/g, "")
    .replace(/\//g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

// -------------- Core Dock (primary icons) --------------
// NOTE: Chat list in your repo lives at /chat (not /messages).
export const APPS: AppDef[] = [
  { slug: "work-orders",  name: "Work Orders",  icon: "🛠️", route: "/work-orders/queue", scope: "work_orders" },
  { slug: "inspections",  name: "Inspections",  icon: "📋", route: "/inspections",        scope: "inspections" },
  { slug: "messages",     name: "Inbox",        icon: "📨", route: "/chat",               scope: "all" },
  { slug: "appointments", name: "Scheduling",   icon: "📆", route: "/dashboard/admin/scheduling", scope: "management" },
  { slug: "tech-assistant", name: "Tech Assistant", icon: "🤖", route: "/tech/assistant", scope: "tech" },
];

// -------------- Every Tile -> Launchable --------------
const SHORTCUTS: AppDef[] = TILES.map((t) => {
  const scope: AppDef["scope"] = (t.scopes.includes("all") ? "all" : t.scopes[0]) as any;
  return {
    slug: `tile-${slugFromHref(t.href)}`,
    name: t.title,
    icon: iconFor(t.title, t.href),
    route: t.href,
    scope,
    roleGate: t.roles,
  };
});

// -------------- Combined + Dedup by route --------------
export const ALL_LAUNCHABLES: AppDef[] = (() => {
  const byRoute = new Map<string, AppDef>();
  // prefer dock apps when there’s a route conflict
  for (const app of APPS) byRoute.set(app.route, app);
  for (const sh of SHORTCUTS) if (!byRoute.has(sh.route)) byRoute.set(sh.route, sh);
  return Array.from(byRoute.values());
})();

export const appsBySlug = Object.fromEntries(
  [...APPS, ...SHORTCUTS].map((a) => [a.slug, a])
);

// -------------- Convenience Filters --------------
export function launchablesForRoleScope(role: Role | null | undefined, scope: Scope | "all") {
  return ALL_LAUNCHABLES.filter((a) => {
    const scopeOk = a.scope === "all" || scope === "all" || a.scope === scope;
    const roleOk = !a.roleGate || (role ? a.roleGate.includes(role) : false);
    return scopeOk && (a.roleGate ? roleOk : true);
  });
}