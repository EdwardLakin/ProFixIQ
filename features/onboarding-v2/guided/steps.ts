import type { GuidedOnboardingStepDefinition, GuidedOnboardingStepKey } from "./types";

export const GUIDED_ONBOARDING_STEPS: GuidedOnboardingStepDefinition[] = [
  {
    key: "customers",
    title: "Customers",
    shortDescription: "Create or import the customer records your advisors will use every day.",
    question: "Do you already have a customer list to bring into ProFixIQ?",
    destinationPath: "/customers",
    ctaLabel: "Open customers",
    skipLabel: "Skip customers for now",
    category: "data",
    order: 10,
    productionOwnerPage: "Customers workspace",
    highlightQuery: { setup: "guided", focus: "customers" },
  },
  {
    key: "vehicles",
    title: "Vehicles",
    shortDescription: "Attach vehicles and fleet units to customer records before live repair work starts.",
    question: "Do you need to import vehicles or fleet units from an existing system?",
    destinationPath: "/vehicles",
    ctaLabel: "Open vehicles",
    skipLabel: "Skip vehicles for now",
    category: "data",
    order: 20,
    productionOwnerPage: "Vehicles workspace",
    highlightQuery: { setup: "guided", focus: "vehicles" },
  },
  {
    key: "staff",
    title: "Staff",
    shortDescription: "Invite advisors, technicians, parts users, and managers with the right roles.",
    question: "Do you have staff users to invite now?",
    destinationPath: "/dashboard/admin/people",
    ctaLabel: "Open people & staff",
    skipLabel: "Skip staff for now",
    category: "team",
    order: 30,
    productionOwnerPage: "People & Staff admin workspace",
    highlightQuery: { setup: "guided", focus: "staff" },
  },
  {
    key: "labor_tax_shop_settings",
    title: "Labor, tax, and shop settings",
    shortDescription: "Confirm rates, tax posture, hours, and core shop operating settings.",
    question: "Are your labor rates, tax defaults, and shop settings ready to verify?",
    destinationPath: "/dashboard/owner/settings",
    ctaLabel: "Open shop settings",
    skipLabel: "Skip settings for now",
    category: "settings",
    order: 40,
    productionOwnerPage: "Owner shop settings",
    highlightQuery: { setup: "guided", focus: "labor_tax_shop_settings" },
  },
  {
    key: "inspection_templates",
    title: "Inspection templates",
    shortDescription: "Set up the inspection templates technicians will use in the bay.",
    question: "Do you want to configure inspection templates before the first live job?",
    destinationPath: "/inspections/templates",
    ctaLabel: "Open templates",
    skipLabel: "Skip templates for now",
    category: "workflow",
    order: 50,
    productionOwnerPage: "Inspection templates",
    highlightQuery: { setup: "guided", focus: "inspection_templates" },
  },
  {
    key: "service_menu",
    title: "Service menu",
    shortDescription: "Build common jobs and canned services for consistent quoting.",
    question: "Do you have a menu of common services to configure?",
    destinationPath: "/menu",
    ctaLabel: "Open service menu",
    skipLabel: "Skip service menu for now",
    category: "workflow",
    order: 60,
    productionOwnerPage: "Service menu catalog",
    highlightQuery: { setup: "guided", focus: "service_menu" },
  },
  {
    key: "inventory_parts",
    title: "Inventory parts",
    shortDescription: "Prepare parts inventory so quotes and work orders can consume stock correctly.",
    question: "Do you need to import or verify parts inventory?",
    destinationPath: "/parts/inventory",
    ctaLabel: "Open parts inventory",
    skipLabel: "Skip inventory for now",
    category: "data",
    order: 70,
    productionOwnerPage: "Parts inventory",
    highlightQuery: { setup: "guided", focus: "inventory_parts" },
  },
  {
    key: "invoices",
    title: "Invoices",
    shortDescription: "Review invoice settings and make sure closeout paperwork is ready.",
    question: "Do invoice defaults or open balances need to be configured now?",
    destinationPath: "/invoices",
    ctaLabel: "Open invoices",
    skipLabel: "Skip invoices for now",
    category: "finance",
    order: 80,
    productionOwnerPage: "Invoices workspace",
    highlightQuery: { setup: "guided", focus: "invoices" },
  },
  {
    key: "service_history",
    title: "Service history",
    shortDescription: "Bring prior service history into the live customer and vehicle timeline when needed.",
    question: "Do you have prior repair history to reference or import?",
    destinationPath: "/work-orders/history",
    ctaLabel: "Open service history",
    skipLabel: "Skip history for now",
    category: "data",
    order: 90,
    productionOwnerPage: "Work order service history",
    highlightQuery: { setup: "guided", focus: "service_history" },
  },
] as const;

export const GUIDED_ONBOARDING_STEP_KEYS = GUIDED_ONBOARDING_STEPS.map((step) => step.key);

export function getGuidedOnboardingStep(key: string | null | undefined) {
  return GUIDED_ONBOARDING_STEPS.find((step) => step.key === key) ?? null;
}

export function isGuidedOnboardingStepKey(value: string): value is GuidedOnboardingStepKey {
  return GUIDED_ONBOARDING_STEP_KEYS.includes(value as GuidedOnboardingStepKey);
}

export function buildGuidedDestination(step: GuidedOnboardingStepDefinition, sessionId: string) {
  const params = new URLSearchParams({
    ...step.highlightQuery,
    returnTo: `/dashboard/onboarding-v2/${sessionId}`,
    guidedSessionId: sessionId,
    guidedStep: step.key,
  });

  return `${step.destinationPath}?${params.toString()}`;
}
