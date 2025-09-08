export type RouteMeta = { title: (href: string) => string; icon?: string; showInTabs?: boolean };

export const ROUTE_META: Record<string, RouteMeta> = {
  "/dashboard": { title: () => "Dashboard", icon: "🏠", showInTabs: true },
  "/dashboard/work-orders/view": { title: () => "Work Orders", icon: "📋", showInTabs: true },
  "/dashboard/work-orders/create": { title: () => "New Work Order", icon: "➕", showInTabs: true },
  "/dashboard/work-orders/[id]": {
    title: (href) => `WO #${href.split("/").pop()?.slice(0, 8) ?? "…"}`,
    icon: "🔧",
    showInTabs: true,
  },
  "/dashboard/work-orders/queue": { title: () => "Job Queue", icon: "🧰", showInTabs: true },
  "/dashboard/inspections": { title: () => "Inspections", icon: "📝", showInTabs: true },
  "/dashboard/parts/orders": { title: () => "Parts", icon: "📦", showInTabs: true },
  "/dashboard/settings": { title: () => "Settings", icon: "⚙️", showInTabs: false },
};

export function metaFor(href: string): { title: string; icon?: string; show: boolean } {
  const keys = Object.keys(ROUTE_META).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const isDyn = key.includes("[");
    const keyPrefix = key.replace(/\[.*?\]/g, "");
    if ((isDyn && href.startsWith(keyPrefix)) || (!isDyn && href === key)) {
      const m = ROUTE_META[key];
      return { title: m.title(href), icon: m.icon, show: m.showInTabs !== false };
    }
  }
  return { title: href, icon: undefined, show: true };
}
