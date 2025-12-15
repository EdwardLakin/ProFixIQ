// features/shared/config/tiles.ts

export type Role =
  | "owner"
  | "admin"
  | "manager"
  | "advisor"
  | "mechanic"
  | "parts";

export type Scope =
  | "work_orders"
  | "inspections"
  | "parts"
  | "tech"
  | "management"
  | "settings"
  | "appointments"
  | "all";

export type Tile = {
  href: string;
  title: string;
  subtitle?: string;
  cta?: string;
  roles: Role[];
  scopes: Scope[];
  section?: string; // optional grouping hint
};

export const TILES: Tile[] = [
  // --- Work Orders ---
  {
    href: "/work-orders/create?autostart=1",
    title: "Create Work Order",
    subtitle: "Start a new job",
    cta: "+",
    roles: ["advisor", "manager", "owner", "admin"],
    scopes: ["work_orders", "all"],
    section: "Operations",
  },
  {
    href: "/work-orders/view",
    title: "View Work Orders",
    subtitle: "Browse & manage",
    roles: ["advisor", "manager", "owner", "admin"],
    scopes: ["work_orders", "all"],
    section: "Operations",
  },
  {
    href: "/work-orders/queue",
    title: "Job Queue",
    subtitle: "Active & in-progress",
    roles: ["advisor", "manager", "owner", "admin"],
    scopes: ["work_orders", "tech", "all"],
    section: "Operations",
  },
  {
    href: "/work-orders/quote-review",
    title: "Quote Review",
    subtitle: "Review & send estimates",
    roles: ["advisor", "manager", "owner", "admin"],
    scopes: ["work_orders", "all"],
    section: "Operations",
  },
  {
    href: "/menu",
    title: "Service Menu",
    subtitle: "Saved services & presets",
    roles: ["advisor", "manager", "owner", "admin"],
    scopes: ["work_orders", "all"],
    section: "Operations",
  },
  {
    href: "/work-orders/history",
    title: "History",
    subtitle: "Completed work",
    roles: ["owner", "admin", "manager", "advisor", "mechanic"],
    scopes: ["work_orders", "all"],
    section: "Operations",
  },
  {
    href: "/billing",
    title: "Billing",
    subtitle: "Ready to invoice",
    roles: ["advisor", "manager", "owner", "admin"],
    scopes: ["work_orders", "all"],
    section: "Operations",
  },

  // --- Appointments ---
  {
    href: "/portal/appointments",
    title: "Appointments",
    subtitle: "Schedule & manage",
    roles: ["owner", "admin", "manager", "advisor"],
    scopes: ["appointments", "management", "all"],
    section: "Operations",
  },

  // --- Inspections ---
  {
    href: "/inspections/templates",
    title: "created inspections",
    subtitle: "View and Edit",
    roles: ["advisor", "manager", "owner", "admin", "mechanic"],
    scopes: ["inspections", "all"],
    section: "Inspections",
  },
  {
    href: "/inspections/custom-inspection",
    title: "Custom Builder",
    subtitle: "Design your own",
    roles: ["advisor", "manager", "owner", "admin"],
    scopes: ["inspections", "all"],
    section: "Inspections",
  },
  {
    href: "/inspections/fleet-import",
    title: "Fleet Form Import",
    subtitle: "Scan & convert fleet inspection sheets",
    roles: ["advisor", "manager", "owner"],
    scopes: ["inspections", "all"],
    section: "Inspections",
  },
  {
    href: "/inspections/saved",
    title: "Saved Inspections",
    subtitle: "Recent & drafts",
    roles: ["advisor", "manager", "owner", "admin"],
    scopes: ["inspections", "all"],
    section: "Inspections",
  },

  // --- Parts ---
  {
    href: "/parts",
    title: "Parts Dashboard",
    subtitle: "Orders & receiving",
    roles: ["parts", "manager", "owner", "admin"],
    scopes: ["parts", "all"],
    section: "Parts",
  },
  {
    href: "/parts/requests",
    title: "Requests",
    subtitle: "View requests",
    roles: ["parts", "manager", "owner", "admin"],
    scopes: ["parts", "all"],
    section: "Parts",
  },
  {
    href: "/parts/inventory",
    title: "Inventory",
    subtitle: "On-hand stock",
    roles: ["parts", "manager", "owner", "admin"],
    scopes: ["parts", "all"],
    section: "Parts",
  },
  {
    href: "/parts/po",
    title: "Purchase Orders",
    subtitle: "Create & manage POs",
    roles: ["parts", "manager", "owner", "admin"],
    scopes: ["parts", "all"],
    section: "Parts",
  },
  {
    href: "/parts/vendors",
    title: "Vendor Integrations",
    subtitle: "API keys for suppliers",
    roles: ["owner", "admin", "manager", "parts"],
    scopes: ["parts", "settings", "all"],
    section: "Parts",
  },

  // --- Admin / Management ---
  {
    href: "/dashboard/owner/create-user",
    title: "Create User",
    subtitle: "Add team members",
    roles: ["owner", "admin"],
    scopes: ["management", "all"],
    section: "Admin",
  },
  {
    href: "/dashboard/owner/reports/technicians",
    title: "Technicians",
    subtitle: "Roster & performance",
    roles: ["owner", "admin", "manager"],
    scopes: ["management", "all"],
    section: "Admin",
  },
  {
    href: "/dashboard/owner/reports",
    title: "Reports",
    subtitle: "Financial & tech performance",
    roles: ["owner", "admin", "manager"],
    scopes: ["management", "all"],
    section: "Admin",
  },
  {
    href: "/dashboard/admin/scheduling",
    title: "Scheduling",
    subtitle: "Calendar & bookings",
    roles: ["owner", "admin", "manager", "advisor"],
    scopes: ["management", "all"],
    section: "Admin",
  },
  {
    href: "/dashboard/admin/billing",
    title: "Billing",
    subtitle: "Subscriptions",
    roles: ["owner", "admin"],
    scopes: ["settings", "all"],
    section: "Admin",
  },

  // ✅ NEW: Payments audit
  {
    href: "/dashboard/owner/payments",
    title: "Payments",
    subtitle: "Customer payments & fees",
    roles: ["owner", "admin", "manager"],
    scopes: ["settings", "work_orders", "all"],
    section: "Admin",
  },

  // --- AI & Tech ---
  {
    href: "/ai/assistant",
    title: "AI Assistant",
    subtitle: "Help & automation",
    roles: ["owner", "admin", "manager", "advisor", "mechanic", "parts"],
    scopes: ["tech", "all"],
    section: "Tools",
  },
  {
    href: "/tech/queue",
    title: "Tech Job Queue",
    subtitle: "My assigned work",
    roles: ["mechanic", "manager", "owner", "admin"],
    scopes: ["tech", "all"],
    section: "Tech",
  },
  {
    href: "/tech/performance",
    title: "My Performance",
    subtitle: "Jobs, hours & efficiency",
    roles: ["mechanic", "manager", "owner", "admin"],
    scopes: ["tech", "all"],
    section: "Tech",
  },
];