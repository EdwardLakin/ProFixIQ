// features/stripe/lib/stripe/constants.ts

export const STRIPE_PLATFORM_FEE_BPS = 300; // 3.00%

export type PlanKey = "pro30" | "unlimited";

export const PLAN_LOOKUP_KEYS: Record<PlanKey, string> = {
  pro30: "profixiq_pro30_monthly",
  unlimited: "profixiq_unlimited_monthly",
};

export const PLAN_LIMITS: Record<PlanKey, number> = {
  pro30: 30,
  unlimited: Number.MAX_SAFE_INTEGER,
};

export const PLAN_PRICING: Record<PlanKey, number> = {
  pro30: 300,
  unlimited: 500,
};