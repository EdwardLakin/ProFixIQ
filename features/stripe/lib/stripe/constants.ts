import {
  BASE_MONTHLY_PRICE,
  BASE_PRICE_LOOKUP_KEY,
  DEFAULT_STRIPE_PLATFORM_FEE_BPS,
  UNLIMITED_MONTHLY_PRICE,
  UNLIMITED_PRICE_LOOKUP_KEY,
} from "@/features/stripe/lib/stripe/billing-model";
import {
  normalizeCanonicalPlan,
  type CanonicalPlan,
} from "@/features/stripe/lib/stripe/plan-normalization";

/** @deprecated Read the shop payment policy instead of assuming a global fee. */
export const STRIPE_PLATFORM_FEE_BPS = DEFAULT_STRIPE_PLATFORM_FEE_BPS;

export type PlanKey = Exclude<CanonicalPlan, "pro">;

export const PLAN_LOOKUP_KEYS: Record<PlanKey, string> = {
  starter: BASE_PRICE_LOOKUP_KEY,
  unlimited: UNLIMITED_PRICE_LOOKUP_KEY,
};

export const LEGACY_PLAN_LOOKUP_KEYS = {
  starter: "profixiq_starter10_monthly",
  pro: "profixiq_pro50_monthly",
  unlimited: "profixiq_unlimited_monthly1",
} as const;

/** Base-plan users above ten are billed as seats, not blocked. */
export const PLAN_LIMITS: Record<PlanKey, number> = {
  starter: Number.MAX_SAFE_INTEGER,
  unlimited: Number.MAX_SAFE_INTEGER,
};

export const PLAN_PRICING: Record<PlanKey, number> = {
  starter: BASE_MONTHLY_PRICE,
  unlimited: UNLIMITED_MONTHLY_PRICE,
};

const PLAN_DISPLAY_LABELS: Record<string, string> = {
  starter: "ProFixIQ Complete",
  pro: "ProFixIQ Complete",
  unlimited: "ProFixIQ Unlimited",
  complete_10: "ProFixIQ Complete",
  complete_50: "ProFixIQ Complete",
  complete_100: "ProFixIQ Complete",
  complete_unlimited: "ProFixIQ Unlimited",
};

export function getPlanDisplayLabel(plan: unknown): string {
  const normalized = String(plan ?? "").trim().toLowerCase();
  if (!normalized) return "ProFixIQ Complete";
  if (PLAN_DISPLAY_LABELS[normalized]) return PLAN_DISPLAY_LABELS[normalized];

  const canonical = normalizeCanonicalPlan(normalized);
  if (canonical) return PLAN_DISPLAY_LABELS[canonical];
  return normalized;
}

export function resolveSeatLimitForPlan(plan: unknown): number | null {
  const canonical = normalizeCanonicalPlan(plan);
  if (!canonical) return null;
  return PLAN_LIMITS[canonical === "pro" ? "starter" : canonical];
}
