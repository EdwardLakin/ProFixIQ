export type UserRole =
  | "owner"
  | "admin"
  | "manager"
  | "advisor"
  | "mechanic"
  | "parts"
  | "dispatcher"
  | "driver"
  | "fleet_manager"
  | "lead_hand"
  | "foreman"
  | "agent_admin"
  // legacy / generic roles still used in some places
  | "service"
  | "tech"
  | "viewer";

export type PersistMeta = {
  scroll?: boolean; // remember scroll position
  inputs?: boolean; // remember input/textarea/select values
  keyParams?: string[]; // dynamic params to scope storage key (e.g., ["id"])
};

export type RouteMeta = {
  title: (href: string) => string;
  icon?: string;
  showInTabs?: boolean; // default true
  persist?: PersistMeta; // optional overrides (defaults applied globally)
  roles?: UserRole[]; // restrict visibility by role
};

// ---- Global defaults: APPLY TO ALL ROUTES (opt-out per route) ----
const PERSIST_DEFAULTS: PersistMeta = { scroll: true, inputs: true };

// If you want a global default role set (i.e., everyone can see unless specified)
// leave undefined to mean "all roles"
const ALL_ROLES: UserRole[] | undefined = undefined;

export const ROUTE_META: Record<string, RouteMeta> = {
  "/dashboard": { title: () => "Shop Overview", icon: "🏠", roles: ALL_ROLES },
  // ----------------------------------------------------------------
  // Work Orders
  // ----------------------------------------------------------------
  "/work-orders": {
    title: () => "Work Orders",
    icon: "📋",
    roles: ["owner", "admin", "manager", "advisor", "service", "mechanic", "tech"],
  },
  "/work-orders/view": {
    title: () => "View Work Orders",
    icon: "📋",
    roles: ["owner", "admin", "manager", "advisor", "service", "lead_hand", "foreman"],
  },
  "/work-orders/create": {
    title: () => "New Work Order",
    icon: "➕",
    roles: ["owner", "admin", "manager", "advisor", "service"],
  },
  "/work-orders/board": {
    title: () => "Work Order Board",
    icon: "📊",
    roles: ["owner", "admin", "manager", "advisor", "mechanic", "tech", "lead_hand", "foreman"],
  },
  "/work-orders/queue": {
    title: () => "Job Queue",
    icon: "🧰",
    roles: ["owner", "admin", "manager", "advisor", "mechanic", "tech", "lead_hand", "foreman"],
  },
  "/work-orders/quote-review": {
    title: () => "Quote Review",
    icon: "✅",
    roles: ["owner", "admin", "manager", "advisor"],
  },
  "/work-orders/history": {
    title: () => "History",
    icon: "📜",
    roles: ["owner", "admin", "manager", "advisor", "mechanic", "lead_hand", "foreman"],
  },
  "/billing": {
    title: () => "Billing",
    icon: "💵",
    roles: ["owner", "admin", "manager", "advisor"],
  },
  "/customers": {
    title: () => "Customer Files",
    icon: "👤",
    roles: ["owner", "admin", "manager", "advisor"],
  },
  "/customers/directory": {
    title: () => "Customer Files",
    icon: "👤",
    roles: ["owner", "admin", "manager", "advisor"],
  },
  "/customers/search": {
    title: () => "Customer Files",
    icon: "👤",
    roles: ["owner", "admin", "manager", "advisor"],
  },
  "/vehicles": {
    title: () => "Vehicle Files",
    icon: "🚗",
    roles: ["owner", "admin", "manager", "advisor"],
  },

  "/quote-review/[id]": {
    title: (href) =>
      `Quote Review · ${href.split("/").pop()?.slice(0, 8) ?? "…"}`,
    icon: "✅",
    persist: { keyParams: ["id"] },
    roles: ["owner", "admin", "manager", "advisor"],
  },

  "/work-orders/[id]": {
    title: (href) => `WO #${href.split("/").pop()?.slice(0, 8) ?? "…"}`,
    icon: "🔧",
    persist: { keyParams: ["id"] },
    roles: ["owner", "admin", "manager", "advisor", "mechanic", "tech", "lead_hand", "foreman"],
  },

  "/work-orders/view/[id]": {
    title: (href) =>
      `Work Order ${href.split("/").pop()?.slice(0, 8) ?? "…"}`,
    icon: "🔧",
    showInTabs: false,
    persist: { keyParams: ["id"] },
    roles: ["owner", "admin", "manager", "advisor", "mechanic", "tech"],
  },

  // Service Menu
  "/menu": {
    title: () => "Service Menu",
    icon: "📋",
    roles: ["owner", "admin", "manager", "advisor"],
  },

  // ----------------------------------------------------------------
  // Appointments (portal)
  // ----------------------------------------------------------------
  "/dashboard/appointments": {
    title: () => "Appointments",
    icon: "📅",
    showInTabs: false, // lives in portal shell, not dashboard tabs
    roles: ["owner", "admin", "manager", "advisor"],
  },

  // ----------------------------------------------------------------
  // Inspections
  // ----------------------------------------------------------------
  "/inspections": {
    title: () => "Inspections",
    icon: "📝",
    roles: ["owner", "admin", "manager", "advisor", "mechanic", "tech", "lead_hand", "foreman"],
  },

  // Runtime screens
  "/inspections/run": {
    title: () => "Run Inspection",
    icon: "📝",
    roles: ["owner", "admin", "manager", "advisor", "mechanic", "tech", "lead_hand", "foreman"],
  },
  "/inspections/fill": {
    title: () => "Inspection",
    icon: "📝",
    roles: ["owner", "admin", "manager", "advisor", "mechanic", "tech", "lead_hand", "foreman"],
  },

  // Inspection templates (tiles.ts uses /inspections/templates for this)
  "/inspections/templates": {
    title: () => "Inspection Templates",
    icon: "🗂️",
    roles: ["owner", "admin", "manager", "advisor", "mechanic", "tech"],
  },

  // Custom builder
  "/inspections/custom-inspection": {
    title: () => "Custom Builder",
    icon: "🧩",
    roles: ["owner", "admin", "manager", "advisor"],
  },

  // Saved inspections
  "/inspections/saved": {
    title: () => "Saved Inspections",
    icon: "💾",
    roles: ["owner", "admin", "manager", "advisor"],
  },

  // Fleet import / review
  "/inspections/fleet-import": {
    title: () => "Fleet Form Import",
    icon: "📄",
    roles: ["owner", "admin", "manager", "advisor"],
  },
  "/inspections/fleet-review": {
    title: () => "Fleet Review",
    icon: "🧭",
    showInTabs: false, // usually a step page
    roles: ["owner", "admin", "manager", "advisor"],
  },

  // Summaries
  "/inspections/summaries": {
    title: () => "Inspection Summaries",
    icon: "📊",
    roles: ["owner", "admin", "manager"],
  },

  // Legacy / generic catch-all for any other /inspections/... route
  "/inspections/[slug]": {
    title: (href) => {
      const last =
        href.split("?")[0].split("/").filter(Boolean).pop() ?? "Inspection";
      const nice = last
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      return `Inspection – ${nice}`;
    },
    icon: "📝",
    roles: ["owner", "admin", "manager", "advisor", "mechanic", "tech", "lead_hand", "foreman"],
  },

  // ----------------------------------------------------------------
  // Parts
  // ----------------------------------------------------------------
  "/parts": {
    title: () => "Parts Dashboard",
    icon: "📦",
    roles: ["owner", "admin", "manager", "parts"],
  },
  "/parts/requests": {
    title: () => "Parts Requests",
    icon: "📨",
    roles: ["owner", "admin", "manager", "parts"],
  },
  "/parts/inventory": {
    title: () => "Inventory",
    icon: "📦",
    roles: ["owner", "admin", "manager", "parts"],
  },
  "/parts/po": {
    title: () => "Purchase Orders",
    icon: "🧾",
    roles: ["owner", "admin", "manager", "parts"],
  },
  "/parts/vendors": {
    title: () => "Vendor Integrations",
    icon: "🔑",
    roles: ["owner", "admin", "manager", "parts"],
  },
  "/parts/returns": {
    title: () => "Returns",
    icon: "↩️",
    roles: ["owner", "admin", "manager", "parts"],
  },
  "/parts/warranties": {
    title: () => "Warranties",
    icon: "🛡️",
    roles: ["owner", "admin", "manager", "parts"],
  },

  // ----------------------------------------------------------------
  // Fleet / HD
  // ----------------------------------------------------------------
  "/fleet/tower": {
    title: () => "Fleet Control Tower",
    icon: "🚛",
    roles: ["owner", "admin", "manager", "fleet_manager", "dispatcher"],
  },
  "/fleet/dispatch": {
    title: () => "Fleet Dispatch",
    icon: "📍",
    roles: ["owner", "admin", "manager", "fleet_manager", "dispatcher"],
  },
  "/fleet/pretrip": {
    title: () => "Pre-trip Reports",
    icon: "📋",
    roles: ["owner", "admin", "manager", "fleet_manager", "dispatcher"],
  },
  "/fleet/units": {
    title: () => "Fleet Units",
    icon: "🚚",
    roles: ["owner", "admin", "manager", "fleet_manager"],
  },
  "/fleet/service-requests": {
    title: () => "Fleet Service Requests",
    icon: "🛠️",
    roles: ["owner", "admin", "manager", "fleet_manager", "dispatcher"],
  },

  // ----------------------------------------------------------------
  // Admin / Management
  // ----------------------------------------------------------------
  "/dashboard/performance": {
    title: () => "Performance",
    icon: "📈",
    roles: ["owner", "admin", "manager"],
  },
  "/dashboard/owner/create-user": {
    title: () => "Create User",
    icon: "➕",
    roles: ["owner", "admin"],
  },
  "/dashboard/owner/settings": {
    title: () => "Owner Settings",
    icon: "⚙️",
    roles: ["owner", "admin"],
  },
  "/dashboard/owner/reports/technicians": {
    title: () => "Technicians",
    icon: "🧑‍🔧",
    roles: ["owner", "admin", "manager"],
  },
  "/dashboard/owner/reports": {
    title: () => "Reports",
    icon: "📈",
    roles: ["owner", "admin", "manager"],
  },
  "/dashboard/workforce": {
    title: () => "Workforce",
    icon: "👥",
    roles: ["owner", "admin", "manager"],
  },
  "/dashboard/workforce/overview": {
    title: () => "Workforce Overview",
    icon: "🧭",
    roles: ["owner", "admin", "manager"],
  },
  "/dashboard/workforce/people": {
    title: () => "People",
    icon: "👤",
    roles: ["owner", "admin"],
  },
  "/dashboard/workforce/people/[id]": {
    title: () => "Person Profile",
    icon: "🪪",
    showInTabs: false,
    persist: { keyParams: ["id"] },
    roles: ["owner", "admin"],
  },
  "/dashboard/workforce/scheduling": {
    title: () => "Scheduling",
    icon: "🗓️",
    roles: ["owner", "admin", "manager"],
  },
  "/dashboard/workforce/time-off": {
    title: () => "Time Off",
    icon: "🌴",
    roles: ["owner", "admin", "manager"],
  },
  "/dashboard/workforce/attendance": {
    title: () => "Attendance & Activity",
    icon: "🕒",
    roles: ["owner", "admin", "manager"],
  },
  "/dashboard/workforce/payroll-review": {
    title: () => "Payroll Review",
    icon: "⏱️",
    // Payroll Review is operational Workforce access and intentionally includes manager.
    roles: ["owner", "admin", "manager"],
  },
  "/dashboard/workforce/documents": {
    title: () => "Documents",
    icon: "📁",
    roles: ["owner", "admin"],
  },
  "/dashboard/workforce/certifications": {
    title: () => "Certifications",
    icon: "🎓",
    roles: ["owner", "admin"],
  },
  "/dashboard/workforce/insights": {
    title: () => "Insights",
    icon: "📊",
    roles: ["owner", "admin", "manager"],
  },
  "/dashboard/admin": {
    title: () => "Admin",
    icon: "🛡️",
    roles: ["owner", "admin"],
  },
  "/dashboard/admin/people": {
    title: () => "People & Staff",
    icon: "👥",
    roles: ["owner", "admin"],
  },
  "/dashboard/admin/people/[id]": {
    title: () => "Person Profile",
    icon: "🪪",
    showInTabs: false,
    persist: { keyParams: ["id"] },
    roles: ["owner", "admin"],
  },
  "/dashboard/admin/scheduling": {
    title: () => "Scheduling",
    icon: "🗓️",
    roles: ["owner", "admin", "manager"],
  },
  "/dashboard/admin/payroll-time": {
    title: () => "Payroll Time",
    icon: "⏱️",
    // Legacy mirror of Payroll Review keeps the same operational access policy.
    roles: ["owner", "admin", "manager"],
  },
  "/dashboard/admin/employee-docs": {
    title: () => "Employee Documents",
    icon: "📁",
    roles: ["owner", "admin"],
  },
  "/dashboard/admin/shops": {
    title: () => "Shop Oversight",
    icon: "🏪",
    roles: ["owner", "admin"],
  },
  "/dashboard/admin/audit": {
    title: () => "Audit",
    icon: "📜",
    roles: ["owner", "admin"],
  },
  "/dashboard/owner/payments": {
    title: () => "Payments",
    icon: "💳",
    roles: ["owner", "admin", "manager"],
  },

  // ----------------------------------------------------------------
  // AI & Tech
  // ----------------------------------------------------------------
  "/ai/assistant": {
    title: () => "AI Assistant",
    icon: "🤖",
    roles: [
      "owner",
      "admin",
      "manager",
      "advisor",
      "mechanic",
      "parts",
      "tech",
      "service",
    ],
  },
  "/chat": {
    title: () => "Team Chat",
    icon: "💬",
    roles: ["owner", "admin", "manager", "advisor", "mechanic", "parts", "tech"],
  },
  "/tech/queue": {
    title: () => "Tech Job Queue",
    icon: "🧰",
    roles: ["owner", "admin", "manager", "mechanic", "tech", "lead_hand", "foreman"],
  },
  "/tech/performance": {
    title: () => "My Performance",
    icon: "📊",
    roles: ["owner", "admin", "manager", "mechanic", "tech"],
  },

  // ----------------------------------------------------------------
  // Hidden / marketing / auth (no tabs)
  // ----------------------------------------------------------------
  "/": {
    title: () => "Home",
    showInTabs: false,
    roles: ALL_ROLES,
  },
  "/sign-in": {
    title: () => "Sign In",
    showInTabs: false,
    persist: { scroll: false, inputs: false },
    roles: ALL_ROLES,
  },
  "/sign-up": {
    title: () => "Sign Up",
    showInTabs: false,
    persist: { scroll: false, inputs: false },
    roles: ALL_ROLES,
  },
  "/signup": {
    title: () => "Sign Up",
    showInTabs: false,
    persist: { scroll: false, inputs: false },
    roles: ALL_ROLES,
  },
  "/subscribe": {
    title: () => "Plans",
    showInTabs: false,
    roles: ["owner"],
  },
  "/compare": {
    title: () => "Compare",
    showInTabs: false,
    roles: ALL_ROLES,
  },
  "/compare-plans": {
    title: () => "Plan & Billing",
    icon: "💳",
    roles: ["owner"],
  },

  // Mobile companion routes (no tabs)
  "/mobile": {
    title: () => "Mobile",
    showInTabs: false,
    roles: ALL_ROLES,
  },
  "/mobile/appointments": {
    title: () => "Schedule",
    showInTabs: false,
    persist: { scroll: false, inputs: true },
    roles: ALL_ROLES,
  },
};

export function metaFor(
  href: string,
  _params?: Record<string, string>,
  role?: UserRole,
): { title: string; icon?: string; show: boolean; persist: PersistMeta } {
  const keys = Object.keys(ROUTE_META).sort((a, b) => b.length - a.length);

  for (const key of keys) {
    const isDyn = key.includes("[");
    const keyPrefix = key.replace(/\[.*?\]/g, "");
    if ((isDyn && href.startsWith(keyPrefix)) || (!isDyn && href === key)) {
      const m = ROUTE_META[key];

      const allowed =
        !m.roles ||
        m.roles.length === 0 ||
        role === undefined ||
        m.roles.includes(role);

      return {
        title: m.title(href),
        icon: m.icon,
        show: allowed && m.showInTabs !== false,
        persist: { ...PERSIST_DEFAULTS, ...(m.persist ?? {}) },
      };
    }
  }

  const last =
    href.split("?")[0].split("/").filter(Boolean).pop() ?? href;
  const nice = last
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return {
    title: nice || "Page",
    icon: "📄",
    show: true,
    persist: { ...PERSIST_DEFAULTS },
  };
}
