export const GUIDED_ONBOARDING_SOURCE = "guided-onboarding-v2";
import type { GuidedOnboardingStepDefinition, GuidedOnboardingStepKey } from "./types";

export const GUIDED_ONBOARDING_STEPS: GuidedOnboardingStepDefinition[] = [
  {
    key: "customers",
    title: "Customers",
    shortDescription: "Create or import the customer records your advisors will use every day.",
    question: "Do you have a customer file to import?",
    destinationPath: "/customers/search",
    ctaLabel: "Yes, import customers",
    skipLabel: "No, skip customers for now",
    category: "data",
    order: 10,
    productionOwnerPage: "Customers workspace",
    highlightQuery: { highlight: "customer-import" },
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
    key: "vehicle_history",
    title: "Vehicle History",
    shortDescription: "Bring prior service history into the live customer and vehicle timeline when needed.",
    question: "Do you have prior repair history to reference or import?",
    destinationPath: "/work-orders/history",
    ctaLabel: "Open vehicle history",
    skipLabel: "Skip history for now",
    category: "data",
    order: 30,
    productionOwnerPage: "Work order service history",
    highlightQuery: { setup: "guided", focus: "vehicle_history" },
  },
  {
    key: "invoices",
    title: "Invoices",
    shortDescription: "Review invoice history and billing defaults so closeout paperwork is ready.",
    question: "Do invoices, balances, or billing defaults need to be configured now?",
    destinationPath: "/billing",
    ctaLabel: "Open invoices",
    skipLabel: "Skip invoices for now",
    category: "finance",
    order: 40,
    productionOwnerPage: "Invoices workspace",
    highlightQuery: { setup: "guided", focus: "invoices" },
  },
  {
    key: "parts",
    title: "Parts",
    shortDescription: "Prepare parts inventory so quotes and work orders can consume stock correctly.",
    question: "Do you need to import or verify parts inventory?",
    destinationPath: "/parts/inventory",
    ctaLabel: "Open parts inventory",
    skipLabel: "Skip parts for now",
    category: "data",
    order: 50,
    productionOwnerPage: "Parts inventory",
    highlightQuery: { setup: "guided", focus: "parts" },
  },
  {
    key: "shop_settings",
    title: "Shop Settings",
    shortDescription: "Confirm shop identity, rates, supplies, hours, and workflow defaults before launch.",
    question: "Do you want to review recommended Shop Settings now?",
    destinationPath: "/dashboard/onboarding-v2",
    ctaLabel: "Review Shop Settings",
    skipLabel: "Skip Shop Settings for now",
    category: "settings",
    order: 60,
    productionOwnerPage: "Guided setup Shop Settings card",
    highlightQuery: { setup: "guided", focus: "shop_settings" },
  },
  {
    key: "analysis",
    title: "AI Business Analysis",
    shortDescription: "Analyze imported and configured shop data to recommend launch improvements without auto-creating records.",
    question: "Do you want AI to review your setup and recommend what to build next?",
    destinationPath: "/dashboard/onboarding-v2/summary",
    ctaLabel: "Open AI analysis",
    skipLabel: "Finish without analysis",
    category: "analysis",
    order: 70,
    productionOwnerPage: "Guided setup AI analysis",
    highlightQuery: { setup: "guided", focus: "analysis" },
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
  const destinationPath = step.key === "analysis"
    ? `/dashboard/onboarding-v2/${sessionId}/summary`
    : step.destinationPath;
  const params = new URLSearchParams({
    ...step.highlightQuery,
    returnTo: `/dashboard/onboarding-v2/${sessionId}`,
    guidedSessionId: sessionId,
    guidedStep: step.key,
  });

  if (!params.has("highlight")) {
    params.set("highlight", step.key);
  }

  return `${destinationPath}?${params.toString()}`;
}
