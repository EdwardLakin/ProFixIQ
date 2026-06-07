import { getGuidedOnboardingStep } from "@/features/onboarding-v2/guided/steps";

export const VEHICLE_GUIDED_ONBOARDING_STEP = getGuidedOnboardingStep("vehicles");

export const VEHICLE_ONBOARDING_SAMPLE_HEADERS = [
  "customer_name",
  "email",
  "phone",
  "year",
  "make",
  "model",
  "vin",
  "license_plate",
  "unit_number",
];
