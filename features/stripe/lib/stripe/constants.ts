// features/stripe/lib/stripe/constants.ts

export const STRIPE_PLATFORM_FEE_BPS = 300; // 3.00%

export type PlanKey = "starter10" | "pro50" | "unlimited";

/**
 * Stripe Price lookup keys (must match Stripe exactly).
 * Note: your Unlimited lookup key has a "1" suffix to avoid conflicts.
 */
export const PLAN_LOOKUP_KEYS: Record<PlanKey, string> = {
  starter10: "profixiq_starter10_monthly",
  pro50: "profixiq_pro50_monthly",
  unlimited: "profixiq_unlimited_monthly1",
};

/**
 * User limits for each plan (enforced in your app).
 */
export const PLAN_LIMITS: Record<PlanKey, number> = {
  starter10: 10,
  pro50: 50,
  unlimited: Number.MAX_SAFE_INTEGER,
};

/**
 * UI pricing display (Stripe is source of truth, but this powers labels).
 */
export const PLAN_PRICING: Record<PlanKey, number> = {
  starter10: 299,
  pro50: 399,
  unlimited: 599,
};

/**
 * Direct Stripe Price IDs (optional but useful for debugging).
 * Your checkout route supports both:
 *  - priceId directly
 *  - lookup key (resolved server-side)
 */
export const PRICE_IDS: Record<PlanKey, { monthly: string; yearly?: string }> = {
  starter10: {
    monthly: "price_1Ss2nnITYwJQigUI2m5lzrdK",
  },
  pro50: {
    monthly: "price_1Ss2gpITYwJQigUInZ2YXhqq",
  },
  unlimited: {
    monthly: "price_1Ss2kPITYwJQigUImcGOkXu0",
  },
};