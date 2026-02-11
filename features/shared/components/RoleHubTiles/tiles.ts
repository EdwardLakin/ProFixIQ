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
  | "all";

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
  {
    href: "/work-orders/create?autostart=1", // ✅ auto-start work order draft
    title: "Create Work Order",
    subtitle: "Start a new job",
    cta: "+",
    roles: ["advisor", "manager", "owner", "admin"],
    scopes: ["work_orders", "all"],
  },
  {
    href: "/work-orders/view",
    title: "View Work Orders",
    subtitle: "Browse & manage",
    roles: ["advisor", "manager", "owner", "admin"],
    scopes: ["work_orders", "all"],
  },
  {
    href: "/work-orders/queue",
    title: "Job Queue",
    subtitle: "Active & in-progress",
    roles: ["mechanic", "manager", "owner", "admin"],
    scopes: ["work_orders", "all"],
  },
  {
    href: "/work-orders/quote-review",
    title: "Quote Review",
    subtitle: "Review & send estimates",
    roles: ["advisor", "manager", "owner", "admin"],
    scopes: ["work_orders", "all"],
  },
  {
    href: "/menu",
    title: "Service Menu",
    subtitle: "Saved services & presets",
    roles: ["advisor", "manager", "owner", "admin"],
    scopes: ["work_orders", "all"],
  },
  {
    href: "/work-orders/history",
    title: "History",
    subtitle: "Completed Work Orders & Invoices",
    roles: ["owner", "admin", "manager", "advisor", "mechanic"],
    scopes: ["work_orders", "all"],
  },
  // NEW: Billing (Ready to invoice)
  {
    href: "/billing",
    title: "Billing",
    subtitle: "Ready to invoice",
    roles: ["advisor", "manager", "owner", "admin"],
    scopes: ["work_orders", "all"],
  },

  // --- Inspections ---
  {
    href: "/inspections/maintenance50",
    title: "Maintenance 50",
    subtitle: "Quick checklist",
    roles: ["advisor", "manager", "owner", "admin", "mechanic"],
    scopes: ["inspections", "all"],
  },
  {
    href: "/inspections/maintenance50-air",
    title: "Maintenance 50 – Air",
    subtitle: "CVIP-style (air brakes)",
    roles: ["advisor", "manager", "owner", "admin", "mechanic"],
    scopes: ["inspections", "all"],
  },
  {
    href: "/inspections/custom-inspection",
    title: "Custom Builder",
    subtitle: "Design your own",
    roles: ["advisor", "manager", "owner", "admin"],
    scopes: ["inspections", "all"],
  },
  {
  href: "/inspections/fleet-import",
  title: "Fleet Form Import",
  subtitle: "Scan & convert fleet inspection sheets",
  roles: ["advisor", "manager", "owner", "admin"],
  scopes: ["inspections", "all"],
},
  {
    href: "/inspections/saved",
    title: "Saved Inspections",
    subtitle: "Recent & drafts",
    roles: ["advisor", "manager", "owner", "admin"],
    scopes: ["inspections", "all"],
  },
  {
    href: "/inspections/templates",
    title: "Templates",
    subtitle: "Reusable inspection sets",
    roles: ["advisor", "manager", "owner", "admin"],
    scopes: ["inspections", "all"],
  },
  {
    href: "/inspections/summary",
    title: "Inspection Summaries",
    subtitle: "Overview & results",
    roles: ["advisor", "manager", "owner", "admin"],
    scopes: ["inspections", "all"],
  },

  // --- Parts ---
  {
    href: "/parts",
    title: "Parts Dashboard",
    subtitle: "Orders & receiving",
    roles: ["parts", "manager", "owner", "admin" ],
    scopes: ["parts", "all"],
  },
  {
    href: "/parts/requests",
    title: "Requests",
    subtitle: "View requests",
    roles: ["parts", "manager", "owner", "admin"],
    scopes: ["parts", "all"],
  },
  {
    href: "/parts/inventory",
    title: "Inventory",
    subtitle: "On-hand stock",
    roles: ["parts", "manager", "owner", "admin"],
    scopes: ["parts", "all"],
  },
  // NEW: Purchase Orders list
  {
    href: "/parts/po",
    title: "Purchase Orders",
    subtitle: "Create & manage POs",
    cta: "+",
    roles: ["parts", "manager", "owner", "admin"],
    scopes: ["parts", "all"],
  },
  // NEW: Scan-to-Receive entry
  {
    href: "/parts/receive",
    title: "Scan to Receive",
    subtitle: "Camera or manual entry",
    roles: ["parts", "manager", "owner", "admin"],
    scopes: ["parts", "all"],
  },
  // Optional: vendor API keys / integrations page
  {
    href: "/parts/vendors",
    title: "Vendor Integrations",
    subtitle: "API keys for suppliers",
    roles: ["owner", "admin", "manager", "parts"],
    scopes: ["parts", "settings", "all"],
  },
  {
    href: "/parts/returns",
    title: "Returns",
    subtitle: "Manage RMAs",
    roles: ["parts", "manager", "owner", "admin"],
    scopes: ["parts", "all"],
  },
  {
    href: "/parts/warranties",
    title: "Warranties",
    subtitle: "Track claims",
    roles: ["parts", "manager", "owner", "admin"],
    scopes: ["parts", "all"],
  },

  // --- Management ---
  {
    href: "/dashboard/owner/create-user",
    title: "Create User",
    subtitle: "Add team members",
    roles: ["owner", "admin"],
    scopes: ["management", "all"],
  },
  {
    href: "/dashboard/admin/scheduling",
    title: "Scheduling",
    subtitle: "Calendar & bookings",
    roles: ["owner", "admin", "manager", "advisor"],
    scopes: ["management", "all"],
  },
  {
    href: "/dashboard/appointments",
    title: "Appointments",
    subtitle: "Customer bookings calendar",
    roles: ["owner", "admin", "manager", "advisor"],
    scopes: ["management", "all"],
  },

  // --- Settings & Reports ---
  {
    href: "/dashboard/owner/reports",
    title: "Reports",
    subtitle: "Business insights",
    roles: ["owner", "admin", "manager"],
    scopes: ["settings", "all"],
  },
  {
    href: "/dashboard/owner/settings",
    title: "Settings",
    subtitle: "Account & shop settings",
    roles: ["owner", "admin"],
    scopes: ["settings", "all"],
  },
  {
    href: "/dashboard/owner/import-customers",
    title: "Import Customers",
    subtitle: "CSV import",
    roles: ["owner", "admin"],
    scopes: ["settings", "all"],
  },
  {
    href: "/compare-plans",
    title: "Plan & Billing",
    subtitle: "Subscription",
    roles: ["owner", "admin"],
    scopes: ["settings", "all"],
  },

  // --- AI & Tech ---
  {
    href: "/tech/queue",
    title: "Tech Job Queue",
    subtitle: "My assigned work",
    roles: ["mechanic", "manager", "owner", "admin"],
    scopes: ["tech", "all"],
  },
];