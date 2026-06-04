import type { GuidedOnboardingStatus, GuidedOnboardingStepKey } from "./steps";

export type JsonObject = Record<string, unknown>;

export type GuidedSessionRow = {
  id: string;
  shop_id: string;
  created_by: string | null;
  status: string;
  current_step_key: GuidedOnboardingStepKey | null;
  summary: JsonObject;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type GuidedStepRow = {
  id: string;
  session_id: string;
  shop_id: string;
  step_key: GuidedOnboardingStepKey;
  status: GuidedOnboardingStatus;
  destination_path: string;
  highlight_key: string;
  skipped_reason: string | null;
  summary: JsonObject;
  error: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type GuidedOnboardingPayload = {
  session: GuidedSessionRow;
  steps: GuidedStepRow[];
};
