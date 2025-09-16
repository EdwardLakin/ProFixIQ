// src/routeMeta.ts

export type UserRole = "owner" | "admin" | "service" | "tech" | "viewer";

export type PersistMeta = {
  scroll?: boolean;          // remember scroll position
  inputs?: boolean;          // remember input/textarea/select values
  keyParams?: string[];      // dynamic params to scope storage key (e.g., ["id"])
};

export type RouteMeta = {
  title: (href: string) => string;
  icon?: string;
  showInTabs?: boolean;      // default true
  persist?: PersistMeta;     // optional overrides (defaults applied globally)
  roles?: UserRole[];        // NEW: restrict visibility by role
};

// ---- Global defaults: APPLY TO ALL ROUTES (opt-out per route) ----
const PERSIST_DEFAULTS: PersistMeta = { scroll: true, inputs: true };

// If you want a global default role set (i.e., everyone can see unless specified)
// leave undefined to mean "all roles"
const ALL_ROLES: UserRole[] | undefined = undefined;

// Define only titles/icons and any per-route overrides or opt-outs.
export const ROUTE_META: Record<string, RouteMeta> = {
  "/dashboard": { title: () => "Dashboard", icon: "🏠", roles: ALL_ROLES },

  // Work Orders
  "/work-orders":              { title: () => "Work Orders",       icon: "📋", roles: ["owner", "admin", "service", "tech"] },
  "/work-orders/view":         { title: () => "View Work Orders",  icon: "📋", roles: ["owner", "admin", "service"] },
  "/work-orders/create":       { title: () => "New Work Order",    icon: "➕", roles: ["owner", "admin", "service"] },
  "/work-orders/queue":        { title: () => "Job Queue",         icon: "🧰", roles: ["owner", "admin", "service", "tech"] },
  "/work-orders/editor":       { title: () => "Work Order Editor", icon: "✍️", roles: ["owner", "admin", "service"] },
  "/work-orders/quote-review": { title: () => "Quote Review",      icon: "✅", roles: ["owner", "admin", "service"] },

  // Per-WO tab (plural): scope persistence by id
  "/work-orders/[id]": {
    title: (href) => `WO #${href.split("/").pop()?.slice(0, 8) ?? "…"}`,
    icon: "🔧",
    persist: { keyParams: ["id"] },
    roles: ["owner", "admin", "service", "tech"],
  },

  // OPTIONAL (singular) detail route you mentioned:
  // If you created /work-order/view/[id], include it too. Hidden from tabs.
  "/work-orders/view/[id]": {
    title: (href) => `Work Order ${href.split("/").pop()?.slice(0, 8) ?? "…"}`,
    icon: "🔧",
    showInTabs: false,
    persist: { keyParams: ["id"] },
    roles: ["owner", "admin", "service", "tech"],
  },

  // Inspections
  "/inspection":                   { title: () => "Inspection Menu",      icon: "📝", roles: ["owner", "admin", "service", "tech"] },
  "/maintenance50":                { title: () => "Maintenance 50",       icon: "🧰", roles: ["owner", "admin", "service", "tech"] },
  // NEW: Maintenance 50 (Air)
  "/maintenance50-air": { title: () => "Maintenance 50 (Air)", icon: "🧰", roles: ["owner", "admin", "service", "tech"] },

  "/inspection/custom-inspection": { title: () => "Custom Builder",       icon: "🧩", roles: ["owner", "admin", "service", "tech"] },
  "/inspection/saved":             { title: () => "Saved Inspections",    icon: "💾", roles: ["owner", "admin", "service", "tech"] },
  "/inspection/templates":         { title: () => "Templates",            icon: "🗂️", roles: ["owner", "admin", "service", "tech"] },
  "/inspection/created":           { title: () => "Created Inspections",  icon: "📤", roles: ["owner", "admin", "service", "tech"] },
  "/inspection/summaries":         { title: () => "Inspection Summaries", icon: "📊", roles: ["owner", "admin", "service"] },

  // Parts
  "/parts":            { title: () => "Parts Dashboard", icon: "📦", roles: ["owner", "admin", "service"] },
  "/parts/inventory":  { title: () => "Inventory",       icon: "📦", roles: ["owner", "admin", "service"] },
  "/parts/returns":    { title: () => "Returns",         icon: "↩️", roles: ["owner", "admin", "service"] },
  "/parts/warranties": { title: () => "Warranties",      icon: "🛡️", roles: ["owner", "admin", "service"] },

  // Management / Settings
  "/dashboard/owner/create-user": { title: () => "Create User",    icon: "➕", roles: ["owner"] },
  "/dashboard/owner/reports":     { title: () => "Reports",        icon: "📈", roles: ["owner"] },
  "/dashboard/owner/settings":    { title: () => "Owner Settings", icon: "⚙️", roles: ["owner"] },

  // Scheduling (Admin)
  "/dashboard/admin/scheduling":  { title: () => "Scheduling",     icon: "📅", roles: ["owner", "admin"] },

  // AI & Messaging
  "/ai/assistant": { title: () => "AI Assistant", icon: "🤖", roles: ["owner", "admin", "service", "tech"] },
  "/chat":         { title: () => "Team Chat",    icon: "💬", roles: ["owner", "admin", "service", "tech"] },

  // ----- Hide these from Tabs (but they still persist unless you override persist) -----
  "/":            { title: () => "Home",        showInTabs: false, roles: ALL_ROLES },
  "/sign-in":     { title: () => "Sign In",     showInTabs: false, persist: { scroll: false, inputs: false }, roles: ALL_ROLES },
  "/signup":      { title: () => "Sign Up",     showInTabs: false, persist: { scroll: false, inputs: false }, roles: ALL_ROLES },
  "/onboarding":  { title: () => "Onboarding",  showInTabs: false, roles: ["owner", "admin"] },
  "/subscribe":   { title: () => "Plans",       showInTabs: false, roles: ["owner"] },
  "/compare":     { title: () => "Compare",     showInTabs: false, roles: ALL_ROLES },

  // Leave visible if you want it in tabs
  "/compare-plans": { title: () => "Plan & Billing", icon: "💳", roles: ["owner"] },
};

// Utility to merge defaults for any route (and for unknown routes)
// NOTE: now accepts `role` to filter visibility
export function metaFor(
  href: string,
  _params?: Record<string, string>,
  role?: UserRole
): { title: string; icon?: string; show: boolean; persist: PersistMeta } {
  const keys = Object.keys(ROUTE_META).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const isDyn = key.includes("[");
    const keyPrefix = key.replace(/\[.*?\]/g, "");
    if ((isDyn && href.startsWith(keyPrefix)) || (!isDyn && href === key)) {
      const m = ROUTE_META[key];

      // role check
      const allowed =
        !m.roles || m.roles.length === 0 || role === undefined || m.roles.includes(role);

      return {
        title: m.title(href),
        icon: m.icon,
        show: allowed && (m.showInTabs !== false),
        persist: { ...PERSIST_DEFAULTS, ...(m.persist ?? {}) },
      };
    }
  }
  // Fallback for routes not listed: show in tabs + apply global defaults
  const last = href.split("?")[0].split("/").filter(Boolean).pop() ?? href;
  const nice = last.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    title: nice || "Page",
    icon: "📄",
    show: true,
    persist: { ...PERSIST_DEFAULTS },
  };
}