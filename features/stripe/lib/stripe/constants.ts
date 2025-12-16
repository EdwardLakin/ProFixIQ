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

export const PRICE_IDS: Record<PlanKey, { monthly: string }> = {
  pro30: { monthly: "price_1Sefd3ITYwJQigUIf99mYFpY" },
  unlimited: { monthly: "price_1SefiBITYwJQigUIm4AtThRj" },
};