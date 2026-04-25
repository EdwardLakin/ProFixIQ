// features/stripe/lib/stripe/constants.ts

import type { CanonicalPlan } from "@/features/stripe/lib/stripe/plan-normalization";

export const STRIPE_PLATFORM_FEE_BPS = 300; // 3.00%

export type PlanKey = CanonicalPlan;

/**
 * Stripe Price lookup keys (must match Stripe exactly).
 * We keep existing Stripe lookup key names for compatibility,
 * while app/DB canonical plan keys are starter/pro/unlimited.
 */
export const PLAN_LOOKUP_KEYS: Record<PlanKey, string> = {
  starter: "profixiq_starter10_monthly",
  pro: "profixiq_pro50_monthly",
  unlimited: "profixiq_unlimited_monthly1",
};

/**
 * User limits for each plan (enforced in app).
 */
export const PLAN_LIMITS: Record<PlanKey, number> = {
  starter: 10,
  pro: 50,
  unlimited: Number.MAX_SAFE_INTEGER,
};

/**
 * UI pricing display (Stripe is source of truth, but this powers labels).
 */
export const PLAN_PRICING: Record<PlanKey, number> = {
  starter: 299,
  pro: 399,
  unlimited: 599,
};
