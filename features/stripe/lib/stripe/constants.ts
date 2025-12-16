// features/stripe/lib/stripe/constants.ts

export const STRIPE_PLATFORM_FEE_BPS = 300; // 3.00%

export type PlanKey = "pro30" | "unlimited";

export const PLAN_LOOKUP_KEYS: Record<PlanKey, string> = {
  pro30: "profixiq_pro30_monthly",
  unlimited: "profixiq_unlimited_monthly",
};

export const PRICE_IDS: Record<PlanKey, { monthly: string }> = {
  pro30: { monthly: "price_1Sefd3ITYwJQigUIf99mYFpY" },
  unlimited: { monthly: "price_1SefiBITYwJQigUIm4AtThRj" },
};