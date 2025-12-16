// features/stripe/lib/stripe/constants.ts

export const STRIPE_PLATFORM_FEE_BPS = 300; // 3.00%

export type PlanKey = "pro30" | "unlimited";

/**
 * Preferred: lookup keys (what you want to wire).
 * These must match Stripe "Lookup key" values exactly.
 */
export const PLAN_LOOKUP_KEYS: Record<PlanKey, string> = {
  pro30: "profixiq_pro30_monthly",
  unlimited: "profixiq_unlimited_monthly",
};

/**
 * Kept for backwards compatibility (other files import this).
 */
export const PLAN_LIMITS: Record<PlanKey, number> = {
  pro30: 30,
  unlimited: Number.MAX_SAFE_INTEGER,
};

/**
 * Kept for UI display + backwards compatibility.
 */
export const PLAN_PRICING: Record<PlanKey, number> = {
  pro30: 300,
  unlimited: 500,
};

/**
 * Direct Stripe Price IDs (used by Checkout session line_items.price).
 * Even if you use lookup keys in UI, the server can still resolve to a price id.
 */
export const PRICE_IDS: Record<PlanKey, { monthly: string; yearly?: string }> = {
  pro30: {
    monthly: "price_1Sefd3ITYwJQigUIf99mYFpY",
  },
  unlimited: {
    monthly: "price_1SefiBITYwJQigUIm4AtThRj",
  },
};