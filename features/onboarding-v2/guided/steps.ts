export const GUIDED_ONBOARDING_SOURCE = "guided-onboarding" as const;

export const GUIDED_ONBOARDING_STATUSES = [
  "not_started",
  "asked",
  "skipped",
  "routing",
  "upload_requested",
  "uploading",
  "uploaded",
  "parsing",
  "validation_required",
  "ready_to_import",
  "importing",
  "completed",
  "failed",
  "retry_requested",
] as const;

export type GuidedOnboardingStatus = (typeof GUIDED_ONBOARDING_STATUSES)[number];
export type GuidedStepImplementationStatus = "available" | "placeholder" | "future";

export type GuidedOnboardingStepKey =
  | "customers"
  | "vehicles"
  | "staff"
  | "labor_tax_shop_settings"
  | "inspection_templates"
  | "service_menu"
  | "inventory_parts"
  | "invoices"
  | "service_history";

export type GuidedOnboardingStepDefinition = {
  stepKey: GuidedOnboardingStepKey;
  label: string;
  question: string;
  destinationPath: string;
  highlightKey: string;
  description: string;
  implementationStatus: GuidedStepImplementationStatus;
};

export const GUIDED_ONBOARDING_STEPS = [
  {
    stepKey: "customers",
    label: "Customers",
    question: "Do you want to bring in your customer list now?",
    destinationPath: "/customers",
    highlightKey: "customers-import",
    description: "Route to Customers so existing customer import/setup tools stay the source of truth.",
    implementationStatus: "placeholder",
  },
  {
    stepKey: "vehicles",
    label: "Vehicles",
    question: "Do you want to set up customer vehicles now?",
    destinationPath: "/customers",
    highlightKey: "vehicles-setup",
    description: "Use Customers for now so vehicles remain connected to customer records.",
    implementationStatus: "placeholder",
  },
  {
    stepKey: "staff",
    label: "Staff",
    question: "Do you want to invite or create staff accounts now?",
    destinationPath: "/dashboard/owner/create-user",
    highlightKey: "staff-create-user",
    description: "Route owners/admins to the existing staff creation page; no bulk user creation happens here.",
    implementationStatus: "placeholder",
  },
  {
    stepKey: "labor_tax_shop_settings",
    label: "Labor, tax, and shop settings",
    question: "Do you want to review labor rates, tax, and shop settings now?",
    destinationPath: "/dashboard/owner/settings",
    highlightKey: "shop-settings-labor-tax",
    description: "Guide setup through the existing owner settings surface.",
    implementationStatus: "placeholder",
  },
  {
    stepKey: "inspection_templates",
    label: "Inspection templates",
    question: "Do you want to configure inspection templates now?",
    destinationPath: "/inspections/templates",
    highlightKey: "inspection-templates-setup",
    description: "Use the real inspection template management page.",
    implementationStatus: "placeholder",
  },
  {
    stepKey: "service_menu",
    label: "Service menu",
    question: "Do you want to set up your canned services or menu now?",
    destinationPath: "/menu",
    highlightKey: "service-menu-setup",
    description: "Route to the service menu page where menu items are owned.",
    implementationStatus: "placeholder",
  },
  {
    stepKey: "inventory_parts",
    label: "Inventory parts",
    question: "Do you want to import or set up inventory parts now?",
    destinationPath: "/parts/inventory",
    highlightKey: "parts-csv-import",
    description: "Highlight the existing CSV import entry point on the parts inventory page.",
    implementationStatus: "available",
  },
  {
    stepKey: "invoices",
    label: "Invoices",
    question: "Do you want to import historical invoices now?",
    destinationPath: "/dashboard/onboarding-v2",
    highlightKey: "invoices-future-import",
    description: "Invoice import is a future guided step; the control room can record skip/future intent.",
    implementationStatus: "future",
  },
  {
    stepKey: "service_history",
    label: "Service history",
    question: "Do you want to review or import service history now?",
    destinationPath: "/work-orders/history",
    highlightKey: "service-history-setup",
    description: "Route to work order history for historical service context.",
    implementationStatus: "placeholder",
  },
] as const satisfies readonly GuidedOnboardingStepDefinition[];

export const GUIDED_ONBOARDING_STEP_KEYS = GUIDED_ONBOARDING_STEPS.map((step) => step.stepKey);

export function isGuidedOnboardingStepKey(value: string): value is GuidedOnboardingStepKey {
  return (GUIDED_ONBOARDING_STEP_KEYS as readonly string[]).includes(value);
}

export function isGuidedOnboardingStatus(value: string): value is GuidedOnboardingStatus {
  return (GUIDED_ONBOARDING_STATUSES as readonly string[]).includes(value);
}

export function getGuidedOnboardingStep(stepKey: GuidedOnboardingStepKey): GuidedOnboardingStepDefinition {
  const step = GUIDED_ONBOARDING_STEPS.find((item) => item.stepKey === stepKey);
  if (!step) throw new Error(`Unknown guided onboarding step: ${stepKey}`);
  return step;
}
