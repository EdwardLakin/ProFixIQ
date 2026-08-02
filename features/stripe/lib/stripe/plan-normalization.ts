export type CanonicalPlan = "starter" | "pro" | "unlimited";
export type CompletePlanKey = "complete_10" | "complete_50" | "complete_100" | "complete_unlimited";
export type KnownPlanInput =
  | CanonicalPlan
  | CompletePlanKey
  | "pro50"
  | "pro_plus"
  | "starter10"
  | "free"
  | "diy";

const CANONICAL_PLAN_SET = new Set<CanonicalPlan>(["starter", "pro", "unlimited"]);

/**
 * The v2 commercial model bills only base-plus-seats or unlimited. The legacy
 * `pro` type remains in the public TypeScript union during rollout so older UI
 * and stored data compile safely, but all capped-plan aliases normalize to the
 * base subscription for reconciliation.
 */
const PLAN_ALIASES: Record<string, CanonicalPlan> = {
  starter: "starter",
  starter10: "starter",
  diy: "starter",
  free: "starter",
  complete_10: "starter",
  complete10: "starter",
  pro: "starter",
  pro50: "starter",
  complete_50: "starter",
  complete_100: "starter",
  unlimited: "unlimited",
  pro_plus: "unlimited",
  complete_unlimited: "unlimited",
};

const KNOWN_PLAN_INPUTS = new Set<string>(Object.keys(PLAN_ALIASES));
const LEGACY_CHECKOUT_KEYS = new Set<string>([
  "pro",
  "pro50",
  "complete_50",
  "complete_100",
  "pro_plus",
  "complete_10",
  "complete_unlimited",
]);

export function normalizeCanonicalPlan(value: unknown): CanonicalPlan | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  return PLAN_ALIASES[normalized] ?? null;
}

export function isKnownPlanInput(value: unknown): value is KnownPlanInput {
  return KNOWN_PLAN_INPUTS.has(String(value ?? "").trim().toLowerCase());
}

export function isUnsupportedCompletePlanForCheckout(value: unknown): boolean {
  return LEGACY_CHECKOUT_KEYS.has(String(value ?? "").trim().toLowerCase());
}

export function isCanonicalPlan(value: unknown): value is CanonicalPlan {
  return CANONICAL_PLAN_SET.has(String(value ?? "").trim().toLowerCase() as CanonicalPlan);
}
