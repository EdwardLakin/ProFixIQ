export type CanonicalPlan = "starter" | "pro" | "unlimited";
export type CompletePlanKey = "complete_10" | "complete_50" | "complete_100" | "complete_unlimited";
export type KnownPlanInput = CanonicalPlan | CompletePlanKey;

const CANONICAL_PLAN_SET = new Set<CanonicalPlan>(["starter", "pro", "unlimited"]);

const PLAN_ALIASES: Record<string, CanonicalPlan> = {
  starter: "starter",
  starter10: "starter",
  diy: "starter",
  free: "starter",
  pro: "pro",
  pro50: "pro",
  complete_50: "pro",
  unlimited: "unlimited",
  pro_plus: "unlimited",
  complete_unlimited: "unlimited",
  complete_10: "starter",
  complete10: "starter",
};

const KNOWN_PLAN_INPUTS = new Set<string>([
  "starter",
  "starter10",
  "free",
  "diy",
  "pro",
  "pro50",
  "unlimited",
  "pro_plus",
  "complete_10",
  "complete_50",
  "complete_100",
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
  return String(value ?? "").trim().toLowerCase() === "complete_100";
}

export function isCanonicalPlan(value: unknown): value is CanonicalPlan {
  return CANONICAL_PLAN_SET.has(String(value ?? "").trim().toLowerCase() as CanonicalPlan);
}
