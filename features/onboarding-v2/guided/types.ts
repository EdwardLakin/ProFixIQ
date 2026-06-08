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

export type GuidedOnboardingStepStatus = "not_started" | "in_progress" | "completed" | "skipped";

export type GuidedOnboardingSessionStatus = "active" | "completed" | "paused" | "skipped";

export type GuidedOnboardingStepCategory = "data" | "team" | "settings" | "workflow" | "finance";

export type GuidedOnboardingStepDefinition = {
  key: GuidedOnboardingStepKey;
  title: string;
  shortDescription: string;
  question: string;
  destinationPath: string;
  ctaLabel: string;
  skipLabel: string;
  category: GuidedOnboardingStepCategory;
  order: number;
  productionOwnerPage: string;
  highlightQuery?: Record<string, string>;
  returnQuery?: Record<string, string>;
};

export type GuidedOnboardingSessionRow = {
  id: string;
  shop_id: string;
  created_by: string | null;
  status: GuidedOnboardingSessionStatus | string;
  current_step_key: GuidedOnboardingStepKey | string | null;
  existing_system: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type GuidedOnboardingStepRow = {
  id: string;
  session_id: string;
  shop_id: string;
  step_key: GuidedOnboardingStepKey | string;
  status: GuidedOnboardingStepStatus | string;
  answer: Record<string, unknown>;
  started_at: string | null;
  completed_at: string | null;
  skipped_at: string | null;
  created_at: string | null;
  destination_path?: string | null;
  title?: string | null;
  question?: string | null;
  description?: string | null;
  updated_at: string | null;
};

export type GuidedOnboardingProgress = {
  total: number;
  completed: number;
  skipped: number;
  inProgress: number;
  percent: number;
};

export type GuidedOnboardingSessionDetail = {
  session: GuidedOnboardingSessionRow;
  steps: GuidedOnboardingStepRow[];
  currentStep: GuidedOnboardingStepDefinition | null;
  progress: GuidedOnboardingProgress;
};
