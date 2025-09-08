export type Role = "owner" | "admin" | "manager" | "advisor" | "mechanic" | "parts";
export type Scope = "work_orders" | "inspections" | "parts" | "tech" | "management" | "settings" | "all";

export type Tile = {
  href: string;
  title: string;
  subtitle?: string;
  cta?: string;
  roles: Role[];
  scopes: Scope[];
};

export const TILES: Tile[] = [
  // --- Work Orders ---
  { href: "/work-orders/create", title: "Create Work Order", subtitle: "Start a new job", cta: "+",
    roles: ["advisor","manager","owner","admin"], scopes: ["work_orders","all"] },
  { href: "/work-orders/view", title: "View Work Orders", subtitle: "Browse & manage",
    roles: ["advisor","manager","owner","admin"], scopes: ["work_orders","all"] },
  { href: "/work-orders/queue", title: "Job Queue", subtitle: "Active & in-progress",
    roles: ["mechanic","manager","owner","admin"], scopes: ["work_orders","tech","all"] },
  { href: "/work-orders/editor", title: "Work Order Editor", subtitle: "Compose job lines",
    roles: ["advisor","manager","owner","admin"], scopes: ["work_orders","all"] },
  { href: "/work-orders/quote-review", title: "Quote Review", subtitle: "Review & send estimates",
    roles: ["advisor","manager","owner","admin"], scopes: ["work_orders","all"] },
  { href: "/menu", title: "Service Menu", subtitle: "Saved services & presets",
    roles: ["advisor","manager","owner","admin"], scopes: ["work_orders","all"] },

  // --- Inspections ---
  { href: "/inspection", title: "Inspection Menu", subtitle: "Perform & review inspections",
    roles: ["advisor","manager","owner","admin","mechanic"], scopes: ["inspections","all"] },
  { href: "/maintenance50", title: "Maintenance 50", subtitle: "Quick checklist",
    roles: ["advisor","manager","owner","admin","mechanic"], scopes: ["inspections","all"] },
  { href: "/inspection/custom-inspection", title: "Custom Builder", subtitle: "Design your own",
    roles: ["advisor","manager","owner","admin"], scopes: ["inspections","all"] },
  { href: "/inspection/saved", title: "Saved Inspections", subtitle: "Recent & drafts",
    roles: ["advisor","manager","owner","admin"], scopes: ["inspections","all"] },
  { href: "/inspection/templates", title: "Templates", subtitle: "Reusable inspection sets",
    roles: ["advisor","manager","owner","admin"], scopes: ["inspections","all"] },

  // --- Parts ---
  { href: "/parts", title: "Parts Dashboard", subtitle: "Orders & receiving",
    roles: ["parts","manager","owner","admin","advisor"], scopes: ["parts","all"] },
  { href: "/parts/inventory", title: "Inventory", subtitle: "On-hand stock",
    roles: ["parts","manager","owner","admin"], scopes: ["parts","all"] },
  { href: "/parts/returns", title: "Returns", subtitle: "Manage RMAs",
    roles: ["parts","manager","owner","admin"], scopes: ["parts","all"] },
  { href: "/parts/warranties", title: "Warranties", subtitle: "Track claims",
    roles: ["parts","manager","owner","admin"], scopes: ["parts","all"] },

  // --- Management ---
  { href: "/dashboard/owner/create-user", title: "Create User", subtitle: "Add team members",
    roles: ["owner","admin"], scopes: ["management","all"] },
  { href: "/dashboard/owner", title: "Owner Dashboard", subtitle: "KPIs & controls",
    roles: ["owner","admin"], scopes: ["management","all"] },

  // --- Settings & Reports ---
  { href: "/dashboard/owner/reports", title: "Reports", subtitle: "Business insights",
    roles: ["owner","admin","manager"], scopes: ["settings","all"] },
  { href: "/dashboard/owner/settings", title: "Settings", subtitle: "Account & shop settings",
    roles: ["owner","admin"], scopes: ["settings","all"] },
  { href: "/dashboard/owner/import-customers", title: "Import Customers", subtitle: "CSV import",
    roles: ["owner","admin"], scopes: ["settings","all"] },
  { href: "/compare-plans", title: "Plan & Billing", subtitle: "Subscription",
    roles: ["owner","admin"], scopes: ["settings","all"] },

  // --- AI & Tech ---
  { href: "/ai/assistant", title: "AI Assistant", subtitle: "Unified expert help",
    roles: ["owner","admin","manager","advisor","mechanic","parts"], scopes: ["all"] },
  { href: "/tech/queue", title: "Tech Job Queue", subtitle: "My assigned work",
    roles: ["mechanic","manager","owner","admin"], scopes: ["tech","all"] },

  // --- Messaging (optional) ---
  { href: "/messages", title: "Team Messages", subtitle: "Internal comms",
    roles: ["owner","admin","manager","advisor","mechanic","parts"], scopes: ["all"] },
];
