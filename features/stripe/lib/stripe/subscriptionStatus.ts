export const STRIPE_SUBSCRIPTION_STATUSES = [
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
] as const;

export type StripeSubscriptionStatus = (typeof STRIPE_SUBSCRIPTION_STATUSES)[number];
export type StripeSubscriptionStatusWithUnknown = StripeSubscriptionStatus | "unknown";

const STRIPE_STATUS_SET = new Set<string>(STRIPE_SUBSCRIPTION_STATUSES);

export function parseStripeSubscriptionStatus(v: unknown): StripeSubscriptionStatusWithUnknown {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return "unknown";
  return STRIPE_STATUS_SET.has(s) ? (s as StripeSubscriptionStatus) : "unknown";
}

export function isBillingAttentionStatus(v: unknown): boolean {
  const status = parseStripeSubscriptionStatus(v);
  return status === "trialing" || status === "past_due" || status === "incomplete" || status === "unpaid";
}
