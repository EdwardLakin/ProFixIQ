export type Role =
  | "owner"
  | "admin"
  | "manager"
  | "advisor"
  | "mechanic"
  | "parts"
  | "dispatcher"
  | "driver"
  | "fleet_manager";

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
  section?: string; // sidebar grouping label
};

export const TILES: Tile[] = [
  /* ---------------------------------------------------------------------- */
  /* TECH (mechanic)                                                        */
  /* ---------------------------------------------------------------------- */
  {
    href: "/dashboard",
    title: "Dashboard",
    subtitle: "Today at a glance",
    roles: ["mechanic", "manager", "owner", "admin", "advisor", "parts", "fleet_manager", "dispatcher", "driver"],
    scopes: ["all"],
    section: "Tech",
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
    href: "/parts/requests?mine=1",
    title: "My Parts Requests",
    subtitle: "Requests involving me",
    roles: ["mechanic", "manager", "owner", "admin"],
    scopes: ["parts", "tech", "all"],
    section: "Tech",
  },
  {
    href: "/chat",
    title: "Team Chat",
    subtitle: "Messages & updates",
    roles: ["mechanic", "manager", "owner", "admin", "advisor", "parts", "fleet_manager", "dispatcher", "driver"],
    scopes: ["all"],
    section: "Tech",
  },
  {
    href: "/dashboard/tech/settings",
    title: "Tech Settings",
    subtitle: "Profile & preferences",
    roles: ["mechanic", "manager", "owner", "admin"],
    scopes: ["settings", "tech", "all"],
    section: "Tech",
  },

  /* ---------------------------------------------------------------------- */
  /* OPERATIONS (work orders / advisors)                                     */
  /* ---------------------------------------------------------------------- */
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
    scopes: ["work_orders", "all"],
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
    href: "/billing",
    title: "Billing",
    subtitle: "Ready to invoice",
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
    /* ---------------------------------------------------------------------- */
  /* MENU (owner/advisor)                                                    */
  /* ---------------------------------------------------------------------- */
  {
    href: "/menu",
    title: "Menu Builder",
    subtitle: "Create and manage menu items",
    roles: ["owner", "admin", "manager", "advisor"],
    scopes: ["management", "settings", "all"],
    section: "Tools",
  },

  /* ---------------------------------------------------------------------- */
  /* APPOINTMENTS                                                            */
  /* ---------------------------------------------------------------------- */
  {
    href: "/dashboard/appointments",
    title: "Appointments",
    subtitle: "Schedule & manage",
    roles: ["owner", "admin", "manager", "advisor"],
    scopes: ["appointments", "management", "all"],
    section: "Operations",
  },

  /* ---------------------------------------------------------------------- */
  /* INSPECTIONS (no mechanic/tech sidebar access)                           */
  /* ---------------------------------------------------------------------- */
  {
    href: "/inspections/templates",
    title: "Inspection Templates",
    subtitle: "View and edit",
    roles: ["advisor", "manager", "owner", "admin"],
    scopes: ["inspections", "all"],
    section: "Tools",
  },
  {
    href: "/inspections/custom-inspection",
    title: "Custom Builder",
    subtitle: "Design your own",
    roles: ["advisor", "manager", "owner", "admin"],
    scopes: ["inspections", "all"],
    section: "Tools",
  },
  {
    href: "/inspections/fleet-import",
    title: "Fleet Form Import",
    subtitle: "Scan & convert fleet sheets",
    roles: ["advisor", "manager", "owner", "admin"],
    scopes: ["inspections", "all"],
    section: "Tools",
  },
  {
    href: "/inspections/saved",
    title: "Saved Inspections",
    subtitle: "Recent & drafts",
    roles: ["advisor", "manager", "owner", "admin"],
    scopes: ["inspections", "all"],
    section: "Tools",
  },

  /* ---------------------------------------------------------------------- */
/* PARTS                                                                   */
/* ---------------------------------------------------------------------- */
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
  href: "/parts/receiving",
  title: "Receiving Inbox",
  subtitle: "Partial receive & allocations",
  roles: ["parts", "manager", "owner", "admin"],
  scopes: ["parts", "all"],
  section: "Parts",
},
{
  href: "/parts/receive",
  title: "Scan to Receive",
  subtitle: "Barcode receiving",
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

// Optional: if you create a “choose PO then receive” landing page.
// If you don’t plan to build /parts/po/receive, delete this tile.
{
  href: "/parts/po/receive",
  title: "Receive from PO",
  subtitle: "Receive + auto-allocate",
  roles: ["parts", "manager", "owner", "admin"],
  scopes: ["parts", "all"],
  section: "Parts",
},

{
  href: "/parts/movements",
  title: "Stock Movements",
  subtitle: "Inventory ledger",
  roles: ["parts", "manager", "owner", "admin"],
  scopes: ["parts", "all"],
  section: "Parts",
},
{
  href: "/parts/allocations",
  title: "Allocations",
  subtitle: "Parts used on jobs",
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
  /* ---------------------------------------------------------------------- */
  /* FLEET                                                                   */
  /* ---------------------------------------------------------------------- */
  {
    href: "/fleet/tower",
    title: "Fleet Control Tower",
    subtitle: "HD units, issues & health",
    roles: ["owner", "admin", "manager", "fleet_manager", "dispatcher"],
    scopes: ["management", "work_orders", "inspections", "all"],
    section: "Fleet",
  },
  {
    href: "/fleet/dispatch",
    title: "Dispatch Board",
    subtitle: "Assign units & routes",
    roles: ["owner", "admin", "manager", "fleet_manager", "dispatcher"],
    scopes: ["management", "work_orders", "all"],
    section: "Fleet",
  },
  {
    href: "/fleet/units",
    title: "Fleet Units",
    subtitle: "Tractors, trailers, buses",
    roles: ["owner", "admin", "manager", "fleet_manager"],
    scopes: ["management", "all"],
    section: "Fleet",
  },
  {
    href: "/fleet/units/new",
    title: "Add Fleet Unit",
    subtitle: "Enroll units into programs",
    roles: ["owner", "admin", "manager", "fleet_manager"],
    scopes: ["management", "inspections", "all"],
    section: "Fleet",
  },
  {
    href: "/fleet/programs",
    title: "Fleet Programs",
    subtitle: "Groups, contacts & notes",
    roles: ["owner", "admin", "manager", "fleet_manager"],
    scopes: ["management", "settings", "all"],
    section: "Fleet",
  },

  /* ---------------------------------------------------------------------- */
  /* TOOLS                                                                   */
  /* ---------------------------------------------------------------------- */
  {
    href: "/ai/assistant",
    title: "AI Assistant",
    subtitle: "Help & automation",
    roles: ["owner", "admin", "manager", "advisor", "mechanic", "parts"],
    scopes: ["tech", "all"],
    section: "Tools",
  },
  {
    href: "/dashboard/owner/reports",
    title: "Shop Health",
    subtitle: "AI snapshot & readiness",
    roles: ["owner", "admin", "manager"],
    scopes: ["management", "all"],
    section: "Tools",
  },

  /* ---------------------------------------------------------------------- */
  /* ADMIN                                                                   */
  /* ---------------------------------------------------------------------- */
  {
    href: "/dashboard/owner/create-user",
    title: "Create User",
    subtitle: "Add team members",
    roles: ["owner", "admin"],
    scopes: ["management", "all"],
    section: "Admin",
  },
  {
    href: "/dashboard/owner/settings",
    title: "Owner Settings",
    subtitle: "Adjust shop settings",
    roles: ["owner", "admin"],
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

  /* ---------------------------------------------------------------------- */
  /* BILLING                                                                 */
  /* ---------------------------------------------------------------------- */
  {
    href: "/compare-plans",
    title: "Plan & Billing",
    subtitle: "Subscription",
    roles: ["owner", "admin"],
    scopes: ["settings", "all"],
    section: "Billing",
  },
  {
    href: "/dashboard/owner/payments",
    title: "Payments",
    subtitle: "Customer payments & fees",
    roles: ["owner", "admin", "manager"],
    scopes: ["settings", "work_orders", "all"],
    section: "Billing",
  },
  {
  title: "Reviews",
  href: "/dashboard/reviews",
  section: "Settings",
  scopes: ["settings", "all"],
  roles: ["owner", "admin", "manager", "advisor", "mechanic", "parts", "fleet_manager"],
  cta: "Feedback",
  },
];