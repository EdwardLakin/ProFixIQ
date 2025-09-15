// src/routeMeta.ts

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
};

// ---- Global defaults: APPLY TO ALL ROUTES (opt-out per route) ----
const PERSIST_DEFAULTS: PersistMeta = { scroll: true, inputs: true };

// Define only titles/icons and any per-route overrides or opt-outs.
export const ROUTE_META: Record<string, RouteMeta> = {
  "/dashboard": { title: () => "Dashboard", icon: "🏠" },

  // Work Orders
  "/work-orders":              { title: () => "Work Orders",       icon: "📋" },
  "/work-orders/view":         { title: () => "View Work Orders",  icon: "📋" },
  "/work-orders/create":       { title: () => "New Work Order",    icon: "➕" },
  "/work-orders/queue":        { title: () => "Job Queue",         icon: "🧰" },
  "/work-orders/editor":       { title: () => "Work Order Editor", icon: "✍️" },
  "/work-orders/quote-review": { title: () => "Quote Review",      icon: "✅" },

  // Per-WO tab: also scope persistence by id so each WO remembers its own state
  "/work-orders/[id]": {
    title: (href) => `WO #${href.split("/").pop()?.slice(0, 8) ?? "…"}`,
    icon: "🔧",
    persist: { keyParams: ["id"] }, // inherits scroll/inputs=true from defaults
  },

  // Inspections
  "/inspection":                   { title: () => "Inspection Menu",      icon: "📝" },
  "/maintenance50":                { title: () => "Maintenance 50",       icon: "🧰" },
  "/inspection/custom-inspection": { title: () => "Custom Builder",       icon: "🧩" },
  "/inspection/saved":             { title: () => "Saved Inspections",    icon: "💾" },
  "/inspection/templates":         { title: () => "Templates",            icon: "🗂️" },
  "/inspection/created":           { title: () => "Created Inspections",  icon: "📤" },
  "/inspection/summaries":         { title: () => "Inspection Summaries", icon: "📊" },

  // Parts
  "/parts":            { title: () => "Parts Dashboard", icon: "📦" },
  "/parts/inventory":  { title: () => "Inventory",       icon: "📦" },
  "/parts/returns":    { title: () => "Returns",         icon: "↩️" },
  "/parts/warranties": { title: () => "Warranties",      icon: "🛡️" },

  // Management / Settings
  "/dashboard/owner/create-user": { title: () => "Create User",    icon: "➕" },
  "/dashboard/owner/reports":     { title: () => "Reports",        icon: "📈" },
  "/dashboard/owner/settings":    { title: () => "Owner Settings", icon: "⚙️" },

  // Scheduling (Admin)
  "/dashboard/admin/scheduling":  { title: () => "Scheduling",     icon: "📅" },

  // AI & Messaging
  "/ai/assistant": { title: () => "AI Assistant", icon: "🤖" },
  "/chat":         { title: () => "Team Chat",    icon: "💬" },

  // ----- Hide these from Tabs (but they still persist unless you override persist) -----
  "/":            { title: () => "Home",        showInTabs: false },
  "/sign-in":     { title: () => "Sign In",     showInTabs: false, persist: { scroll: false, inputs: false } },
  "/signup":      { title: () => "Sign Up",     showInTabs: false, persist: { scroll: false, inputs: false } },
  "/onboarding":  { title: () => "Onboarding",  showInTabs: false },
  "/subscribe":   { title: () => "Plans",       showInTabs: false },
  "/compare":     { title: () => "Compare",     showInTabs: false },
  "/confirm":     { title: () => "Confirm",     showInTabs: false },

  // Leave visible if you want it in tabs
  "/compare-plans": { title: () => "Plan & Billing", icon: "💳" },
};

// Utility to merge defaults for any route (and for unknown routes)
export function metaFor(
  href: string,
  _params?: Record<string, string>
): { title: string; icon?: string; show: boolean; persist: PersistMeta } {
  const keys = Object.keys(ROUTE_META).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const isDyn = key.includes("[");
    const keyPrefix = key.replace(/\[.*?\]/g, "");
    if ((isDyn && href.startsWith(keyPrefix)) || (!isDyn && href === key)) {
      const m = ROUTE_META[key];
      return {
        title: m.title(href),
        icon: m.icon,
        show: m.showInTabs !== false,
        persist: { ...PERSIST_DEFAULTS, ...(m.persist ?? {}) },
      };
    }
  }
  // Fallback for routes not listed: show in tabs + apply global defaults
  const last = href.split("?")[0].split("/").filter(Boolean).pop() ?? href;
  const nice = last.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return { title: nice || "Page", icon: "📄", show: true, persist: { ...PERSIST_DEFAULTS } };
}