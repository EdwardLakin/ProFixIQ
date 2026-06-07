import type { Database } from "@shared/types/types/supabase";

export type GuidedOnboardingStepKey =
  | "customers"
  | "vehicles"
  | "staff"
  | "settings"
  | "inspection_templates"
  | "service_menu"
  | "parts_inventory"
  | "invoices_history"
  | "fleet_history_import";

export type GuidedOnboardingStepCategory = "setup" | "data" | "operations";
export type GuidedOnboardingStepStatus = "complete" | "in_progress" | "not_started" | "unknown";
export type GuidedOnboardingRole = "owner" | "admin" | "manager" | "service_advisor" | "mechanic" | "tech";

type PublicTables = Database["public"]["Tables"];
export type GuidedOnboardingCountTable = keyof Pick<
  PublicTables,
  "customers" | "vehicles" | "profiles" | "inspection_templates" | "menu_items" | "parts" | "work_orders" | "history"
>;

export type GuidedOnboardingDataSource =
  | {
      kind: "table_count";
      table: GuidedOnboardingCountTable;
      label: string;
      completeAt: number;
      shopScoped?: boolean;
    }
  | {
      kind: "shop_settings";
      label: string;
      fields: Array<"labor_rate" | "tax_rate" | "supplies_percent">;
    }
  | {
      kind: "import_flow";
      label: string;
      supported: boolean;
    };

export type GuidedOnboardingImportLaunch = {
  label: string;
  href: string;
  domains: Array<"customers" | "vehicles" | "parts" | "history" | "invoices" | "fleet">;
  stable: boolean;
};

export type GuidedOnboardingStep = {
  stepKey: GuidedOnboardingStepKey;
  title: string;
  description: string;
  destinationPath: string;
  cta: string;
  category: GuidedOnboardingStepCategory;
  allowedRoles: GuidedOnboardingRole[];
  optional: true;
  dataSource: GuidedOnboardingDataSource;
  importLaunch?: GuidedOnboardingImportLaunch;
};

const OWNER_ADMIN: GuidedOnboardingRole[] = ["owner", "admin"];

export const GUIDED_ONBOARDING_STEPS: GuidedOnboardingStep[] = [
  {
    stepKey: "customers",
    title: "Customers",
    description: "Review customer search and customer file workflows before importing or creating records.",
    destinationPath: "/customers/search",
    cta: "Open customers",
    category: "data",
    allowedRoles: OWNER_ADMIN,
    optional: true,
    dataSource: { kind: "table_count", table: "customers", label: "customer records", completeAt: 1 },
    importLaunch: {
      label: "Launch customer CSV import",
      href: "/dashboard/owner/import-customers",
      domains: ["customers"],
      stable: true,
    },
  },
  {
    stepKey: "vehicles",
    title: "Vehicles",
    description: "Confirm vehicles from customer files without changing active shop context.",
    destinationPath: "/customers/search",
    cta: "Open customer vehicles",
    category: "data",
    allowedRoles: OWNER_ADMIN,
    optional: true,
    dataSource: { kind: "table_count", table: "vehicles", label: "vehicle records", completeAt: 1 },
    importLaunch: {
      label: "Launch guided CSV workspace",
      href: "/dashboard/onboarding-v2?mode=guided&step=vehicles",
      domains: ["vehicles"],
      stable: true,
    },
  },
  {
    stepKey: "staff",
    title: "Staff",
    description: "Invite or review team members through the existing owner user management flow.",
    destinationPath: "/dashboard/owner/create-user",
    cta: "Open staff setup",
    category: "setup",
    allowedRoles: OWNER_ADMIN,
    optional: true,
    dataSource: { kind: "table_count", table: "profiles", label: "team profiles", completeAt: 2 },
  },
  {
    stepKey: "settings",
    title: "Labor, tax, and shop settings",
    description: "Check business identity, operation defaults, branding, billing, and integrations.",
    destinationPath: "/dashboard/owner/settings",
    cta: "Open settings",
    category: "setup",
    allowedRoles: OWNER_ADMIN,
    optional: true,
    dataSource: { kind: "shop_settings", label: "labor/tax defaults", fields: ["labor_rate", "tax_rate", "supplies_percent"] },
  },
  {
    stepKey: "inspection_templates",
    title: "Inspection templates",
    description: "Review templates using the current inspections page instead of a new route stack.",
    destinationPath: "/inspections/templates",
    cta: "Open templates",
    category: "operations",
    allowedRoles: OWNER_ADMIN,
    optional: true,
    dataSource: { kind: "table_count", table: "inspection_templates", label: "inspection templates", completeAt: 1 },
  },
  {
    stepKey: "service_menu",
    title: "Service menu",
    description: "Build canned services and menu pricing from the existing menu builder.",
    destinationPath: "/menu",
    cta: "Open menu builder",
    category: "operations",
    allowedRoles: OWNER_ADMIN,
    optional: true,
    dataSource: { kind: "table_count", table: "menu_items", label: "service menu items", completeAt: 1 },
  },
  {
    stepKey: "parts_inventory",
    title: "Parts inventory",
    description: "Review inventory setup through the existing parts inventory page.",
    destinationPath: "/parts/inventory",
    cta: "Open inventory",
    category: "operations",
    allowedRoles: OWNER_ADMIN,
    optional: true,
    dataSource: { kind: "table_count", table: "parts", label: "inventory parts", completeAt: 1 },
    importLaunch: {
      label: "Open parts CSV import",
      href: "/parts/inventory?import=csv",
      domains: ["parts"],
      stable: true,
    },
  },
  {
    stepKey: "invoices_history",
    title: "Invoices and history",
    description: "Review customer billing and completed service history from stable production pages.",
    destinationPath: "/billing",
    cta: "Open billing",
    category: "operations",
    allowedRoles: OWNER_ADMIN,
    optional: true,
    dataSource: { kind: "table_count", table: "work_orders", label: "invoice-ready work orders", completeAt: 1 },
  },
  {
    stepKey: "fleet_history_import",
    title: "Fleet and service history import",
    description: "Use the guided workspace for supported fleet/history imports without forcing onboarding sessions.",
    destinationPath: "/dashboard/onboarding-v2?mode=guided&step=fleet_history_import",
    cta: "Open guided workspace",
    category: "data",
    allowedRoles: OWNER_ADMIN,
    optional: true,
    dataSource: { kind: "table_count", table: "history", label: "history records", completeAt: 1 },
    importLaunch: {
      label: "Launch guided import workspace",
      href: "/dashboard/onboarding-v2?mode=guided&step=fleet_history_import",
      domains: ["history", "invoices", "fleet"],
      stable: true,
    },
  },
];

export function getGuidedOnboardingStep(stepKey: GuidedOnboardingStepKey): GuidedOnboardingStep {
  const step = GUIDED_ONBOARDING_STEPS.find((candidate) => candidate.stepKey === stepKey);
  if (!step) throw new Error(`Unknown guided onboarding step: ${stepKey}`);
  return step;
}

export function canRoleUseGuidedOnboardingStep(role: string | null | undefined, step: GuidedOnboardingStep): boolean {
  if (!role) return false;
  return step.allowedRoles.includes(role as GuidedOnboardingRole);
}

export function getGuidedOnboardingStepStatus(count: number | null | undefined, completeAt: number): GuidedOnboardingStepStatus {
  if (count == null) return "unknown";
  if (count >= completeAt) return "complete";
  if (count > 0) return "in_progress";
  return "not_started";
}
