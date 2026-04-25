export type CanonicalPlan = "starter" | "pro" | "unlimited";

const CANONICAL_PLAN_SET = new Set<CanonicalPlan>(["starter", "pro", "unlimited"]);

const PLAN_ALIASES: Record<string, CanonicalPlan> = {
  starter: "starter",
  starter10: "starter",
  diy: "starter",
  free: "starter",
  pro: "pro",
  pro50: "pro",
  unlimited: "unlimited",
  pro_plus: "unlimited",
};

export function normalizeCanonicalPlan(value: unknown): CanonicalPlan | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  return PLAN_ALIASES[normalized] ?? null;
}

export function isCanonicalPlan(value: unknown): value is CanonicalPlan {
  return CANONICAL_PLAN_SET.has(String(value ?? "").trim().toLowerCase() as CanonicalPlan);
}
