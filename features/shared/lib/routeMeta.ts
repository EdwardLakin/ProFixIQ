export type RouteMeta = {
  title: (href: string) => string;
  icon?: string;
  showInTabs?: boolean; // default true
};

export const ROUTE_META: Record<string, RouteMeta> = {
  // ----- App areas that SHOULD appear in Tabs -----
  "/dashboard": { title: () => "Dashboard", icon: "🏠", showInTabs: true },

  // Work Orders
  "/work-orders":            { title: () => "Work Orders",      icon: "📋", showInTabs: true },
  "/work-orders/view":       { title: () => "View Work Orders", icon: "📋", showInTabs: true },
  "/work-orders/create":     { title: () => "New Work Order",   icon: "➕", showInTabs: true },
  "/work-orders/queue":      { title: () => "Job Queue",        icon: "🧰", showInTabs: true },
  "/work-orders/editor":     { title: () => "Work Order Editor",icon: "✍️", showInTabs: true },
  "/work-orders/quote-review": { title: () => "Quote Review",   icon: "✅", showInTabs: true },
  "/work-orders/[id]": {
    title: (href) => `WO #${href.split("/").pop()?.slice(0, 8) ?? "…"}`,
    icon: "🔧",
    showInTabs: true,
  },

  // Inspections
  "/inspection":                    { title: () => "Inspection Menu",     icon: "📝", showInTabs: true },
  "/maintenance50":                 { title: () => "Maintenance 50",      icon: "🧰", showInTabs: true },
  "/inspection/custom-inspection":  { title: () => "Custom Builder",      icon: "🧩", showInTabs: true },
  "/inspection/saved":              { title: () => "Saved Inspections",   icon: "💾", showInTabs: true },
  "/inspection/templates":          { title: () => "Templates",           icon: "🗂️", showInTabs: true },
  "/inspection/created":            { title: () => "Created Inspections", icon: "📤", showInTabs: true },
  "/inspection/summaries":          { title: () => "Inspection Summaries",icon: "📊", showInTabs: true },

  // Parts
  "/parts":             { title: () => "Parts Dashboard", icon: "📦", showInTabs: true },
  "/parts/inventory":   { title: () => "Inventory",       icon: "📦", showInTabs: true },
  "/parts/returns":     { title: () => "Returns",         icon: "↩️", showInTabs: true },
  "/parts/warranties":  { title: () => "Warranties",      icon: "🛡️", showInTabs: true },

  // Management / Settings
  "/dashboard/owner/create-user":   { title: () => "Create User",    icon: "➕", showInTabs: true },
  "/dashboard/owner/reports":       { title: () => "Reports",        icon: "📈", showInTabs: true },
  "/dashboard/owner/settings":      { title: () => "Owner Settings", icon: "⚙️", showInTabs: true },
  "/compare-plans":                 { title: () => "Plan & Billing", icon: "💳", showInTabs: true },

  // AI & Messaging (support both routes to avoid 404 from mismatched links)
  "/ai/assistant":  { title: () => "AI Assistant",  icon: "🤖", showInTabs: true },
  "/chat":          { title: () => "Team Chat",     icon: "💬", showInTabs: true },

  // ----- Routes that should NOT appear in Tabs -----
  "/":              { title: () => "Home",           showInTabs: false },
  "/sign-in":       { title: () => "Sign In",        showInTabs: false },
  "/signup":        { title: () => "Sign Up",        showInTabs: false },
  "/onboarding":    { title: () => "Onboarding",     showInTabs: false },
  "/subscribe":     { title: () => "Plans",          showInTabs: false },
  "/compare":       { title: () => "Compare",        showInTabs: false },
  "/confirm":       { title: () => "Confirm",        showInTabs: false },
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
  // Fallback readable title
  const last = href.split("?")[0].split("/").filter(Boolean).pop() ?? href;
  const nice = last.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return { title: nice || "Page", icon: "📄", show: true };
}