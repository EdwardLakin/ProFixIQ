export type ShopBillingEntitlementState =
  | "active"
  | "trialing"
  | "grace_period"
  | "internal_demo"
  | "read_only"
  | "suspended";

export type ShopBillingEntitlementOverride =
  | "active"
  | "internal_demo"
  | "read_only"
  | "suspended";

export type ShopBillingEntitlementInput = {
  stripeSubscriptionStatus?: unknown;
  stripeTrialEnd?: string | null;
  billingGraceUntil?: string | null;
  billingEntitlementOverride?: unknown;
};

export type ShopBillingEntitlement = {
  state: ShopBillingEntitlementState;
  canWrite: boolean;
  reason:
    | "stripe_active"
    | "stripe_trialing"
    | "billing_grace"
    | "internal_override"
    | "read_only_override"
    | "suspended_override"
    | "subscription_inactive";
};

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function isFuture(value: string | null | undefined, now: number): boolean {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp > now;
}

export function resolveShopBillingEntitlement(
  input: ShopBillingEntitlementInput,
  now: number = Date.now(),
): ShopBillingEntitlement {
  const override = normalize(input.billingEntitlementOverride);

  if (override === "internal_demo" || override === "active") {
    return {
      state: override,
      canWrite: true,
      reason: "internal_override",
    };
  }

  if (override === "suspended") {
    return {
      state: "suspended",
      canWrite: false,
      reason: "suspended_override",
    };
  }

  if (override === "read_only") {
    return {
      state: "read_only",
      canWrite: false,
      reason: "read_only_override",
    };
  }

  const status = normalize(input.stripeSubscriptionStatus);

  if (status === "active") {
    return { state: "active", canWrite: true, reason: "stripe_active" };
  }

  if (
    status === "trialing" &&
    (!input.stripeTrialEnd || isFuture(input.stripeTrialEnd, now))
  ) {
    return { state: "trialing", canWrite: true, reason: "stripe_trialing" };
  }

  if (isFuture(input.billingGraceUntil, now)) {
    return {
      state: "grace_period",
      canWrite: true,
      reason: "billing_grace",
    };
  }

  return {
    state: "read_only",
    canWrite: false,
    reason: "subscription_inactive",
  };
}

export function isShopBillingWriteAllowed(
  input: ShopBillingEntitlementInput,
  now: number = Date.now(),
): boolean {
  return resolveShopBillingEntitlement(input, now).canWrite;
}
