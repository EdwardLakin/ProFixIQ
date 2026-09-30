import {
  normalizeCanonicalPlan,
  type CanonicalPlan,
} from "@/features/stripe/lib/stripe/plan-normalization";

export type DemoPlanPresentation = {
  plan: CanonicalPlan;
  label: string;
  seatLimit: number | null;
};

const PLAN_SEAT_LIMITS: Record<CanonicalPlan, number | null> = {
  starter: 10,
  pro: 50,
  unlimited: null,
};

/** Internal demo shops include the complete product package and unlimited seats. */
export function resolvePlanPresentation(
  rawPlan: unknown,
  billingEntitlementOverride: unknown,
): DemoPlanPresentation {
  if (String(billingEntitlementOverride ?? "").trim().toLowerCase() === "internal_demo") {
    return {
      plan: "unlimited",
      label: "Complete Operations (Demo)",
      seatLimit: null,
    };
  }

  const plan = normalizeCanonicalPlan(rawPlan) ?? "starter";
  return {
    plan,
    label: plan.charAt(0).toUpperCase() + plan.slice(1),
    seatLimit: PLAN_SEAT_LIMITS[plan],
  };
}
