// features/stripe/lib/stripe/constants.ts

import { normalizeCanonicalPlan, type CanonicalPlan } from "@/features/stripe/lib/stripe/plan-normalization";

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

const PLAN_DISPLAY_LABELS: Record<string, string> = {
  starter: "Complete 10",
  pro: "Complete 50",
  unlimited: "Complete Unlimited",
  complete_10: "Complete 10",
  complete_50: "Complete 50",
  complete_100: "Complete 100",
  complete_unlimited: "Complete Unlimited",
};

const COMPLETE_PLAN_LIMITS: Record<string, number> = {
  complete_10: 10,
  complete_50: 50,
  complete_100: 100,
  complete_unlimited: Number.MAX_SAFE_INTEGER,
};

export function getPlanDisplayLabel(plan: unknown): string {
  const normalized = String(plan ?? "").trim().toLowerCase();
  if (!normalized) return "Complete 10";
  if (PLAN_DISPLAY_LABELS[normalized]) return PLAN_DISPLAY_LABELS[normalized];

  const canonical = normalizeCanonicalPlan(normalized);
  if (canonical) return PLAN_DISPLAY_LABELS[canonical];
  return normalized;
}

export function resolveSeatLimitForPlan(plan: unknown): number | null {
  const normalized = String(plan ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (COMPLETE_PLAN_LIMITS[normalized] !== undefined) return COMPLETE_PLAN_LIMITS[normalized];

  const canonical = normalizeCanonicalPlan(normalized);
  return canonical ? PLAN_LIMITS[canonical] : null;
}
