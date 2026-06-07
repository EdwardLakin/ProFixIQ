export type GuidedOnboardingStepKey =
  | "customers"
  | "vehicles"
  | "staff"
  | "settings"
  | "inspection_templates"
  | "service_menu"
  | "customer_import"
  | "invoices"
  | "parts_inventory";

export type GuidedOnboardingStep = {
  stepKey: GuidedOnboardingStepKey;
  title: string;
  description: string;
  destinationPath: string;
  cta: string;
  category: "setup" | "data" | "operations";
};

export const GUIDED_ONBOARDING_STEPS: GuidedOnboardingStep[] = [
  {
    stepKey: "customers",
    title: "Customers",
    description: "Review customer search and customer file workflows before importing or creating records.",
    destinationPath: "/customers/search",
    cta: "Open customers",
    category: "data",
  },
  {
    stepKey: "vehicles",
    title: "Vehicles",
    description: "Confirm vehicles from customer files without changing active shop context.",
    destinationPath: "/customers/search",
    cta: "Open customer vehicles",
    category: "data",
  },
  {
    stepKey: "staff",
    title: "Staff",
    description: "Invite or review team members through the existing owner user management flow.",
    destinationPath: "/dashboard/owner/create-user",
    cta: "Open staff setup",
    category: "setup",
  },
  {
    stepKey: "settings",
    title: "Shop settings",
    description: "Check business identity, operation defaults, branding, billing, and integrations.",
    destinationPath: "/dashboard/owner/settings",
    cta: "Open settings",
    category: "setup",
  },
  {
    stepKey: "inspection_templates",
    title: "Inspection templates",
    description: "Review templates using the current inspections page instead of a new route stack.",
    destinationPath: "/inspections/templates",
    cta: "Open templates",
    category: "operations",
  },
  {
    stepKey: "service_menu",
    title: "Service menu",
    description: "Build canned services and menu pricing from the existing menu builder.",
    destinationPath: "/menu",
    cta: "Open menu builder",
    category: "operations",
  },
  {
    stepKey: "customer_import",
    title: "Customer CSV import",
    description: "Use the current owner import surface for customer CSV staging and validation.",
    destinationPath: "/dashboard/owner/import-customers",
    cta: "Open customer import",
    category: "data",
  },
  {
    stepKey: "invoices",
    title: "Invoices and history",
    description: "Review customer billing and completed service history from stable production pages.",
    destinationPath: "/billing",
    cta: "Open billing",
    category: "operations",
  },
  {
    stepKey: "parts_inventory",
    title: "Parts inventory",
    description: "Review inventory setup through the existing parts inventory page.",
    destinationPath: "/parts/inventory",
    cta: "Open inventory",
    category: "operations",
  },
];

export function getGuidedOnboardingStep(stepKey: GuidedOnboardingStepKey): GuidedOnboardingStep {
  const step = GUIDED_ONBOARDING_STEPS.find((candidate) => candidate.stepKey === stepKey);
  if (!step) throw new Error(`Unknown guided onboarding step: ${stepKey}`);
  return step;
}
