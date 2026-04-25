import Stripe from "stripe";

export const MANAGED_SUBSCRIPTION_STATUSES = new Set([
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "paused",
]);

const HYDRATABLE_SINGLE_SUBSCRIPTION_STATUSES = new Set([
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "paused",
  "incomplete",
]);

function normalizeStatus(status: unknown): string {
  return String(status ?? "").trim().toLowerCase();
}

function toSubscriptionCustomerId(subscription: Stripe.Subscription): string | null {
  if (typeof subscription.customer === "string") {
    return subscription.customer.trim() || null;
  }
  const id = String(subscription.customer?.id ?? "").trim();
  return id || null;
}

function detectExclusionReasons(args: {
  subscription: Stripe.Subscription;
  expectedCustomerId: string;
}): string[] {
  const { subscription, expectedCustomerId } = args;
  const reasons: string[] = [];
  const normalizedStatus = normalizeStatus(subscription.status);
  const subscriptionCustomerId = toSubscriptionCustomerId(subscription);

  if (!MANAGED_SUBSCRIPTION_STATUSES.has(normalizedStatus)) {
    reasons.push("status_not_managed");
  }

  if (!HYDRATABLE_SINGLE_SUBSCRIPTION_STATUSES.has(normalizedStatus)) {
    reasons.push("status_not_single_subscription_hydratable");
  }

  if (subscriptionCustomerId !== expectedCustomerId) {
    reasons.push("subscription_customer_mismatch");
  }

  return reasons;
}

export type StripeCustomerDiagnostics = {
  customer_id: string;
  customer_exists: boolean;
  customer_deleted: boolean;
  stripe_mode: "live" | "test" | "unknown";
  customer_mode: "live" | "test" | "unknown";
  customer_lookup_error: string | null;
  likely_mode_mismatch: boolean;
};

export type SubscriptionDiagnosticEntry = {
  subscription_id: string;
  status: string;
  customer_id: string | null;
  livemode: boolean;
  metadata_shop_id: string | null;
  excluded_reasons: string[];
};

export type CustomerSubscriptionDiagnostics = {
  customer: StripeCustomerDiagnostics;
  all_subscription_ids: string[];
  managed_subscription_ids: string[];
  single_hydratable_subscription_id: string | null;
  subscription_diagnostics: SubscriptionDiagnosticEntry[];
  no_subscriptions_found: boolean;
  subscriptions_exist_but_none_managed: boolean;
};

export async function collectCustomerSubscriptionDiagnostics(args: {
  stripe: Stripe;
  customerId: string;
}): Promise<CustomerSubscriptionDiagnostics> {
  const { stripe, customerId } = args;

  const customerDiagnostics: StripeCustomerDiagnostics = {
    customer_id: customerId,
    customer_exists: false,
    customer_deleted: false,
    stripe_mode: "unknown",
    customer_mode: "unknown",
    customer_lookup_error: null,
    likely_mode_mismatch: false,
  };

  try {
    const customer = await stripe.customers.retrieve(customerId);
    if ("deleted" in customer && customer.deleted) {
      customerDiagnostics.customer_exists = true;
      customerDiagnostics.customer_deleted = true;
    } else {
      customerDiagnostics.customer_exists = true;
      customerDiagnostics.customer_mode = customer.livemode ? "live" : "test";
    }
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) {
      customerDiagnostics.customer_lookup_error = error.message;
      if (error.code === "resource_missing") {
        customerDiagnostics.likely_mode_mismatch = true;
      }
    } else {
      customerDiagnostics.customer_lookup_error = "unknown_customer_lookup_error";
    }
  }

  const list = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });

  const allIds = list.data.map((subscription) => subscription.id);
  const stripeMode = list.data[0]?.livemode;
  customerDiagnostics.stripe_mode =
    typeof stripeMode === "boolean" ? (stripeMode ? "live" : "test") : customerDiagnostics.stripe_mode;

  if (customerDiagnostics.customer_mode !== "unknown" && customerDiagnostics.stripe_mode !== "unknown") {
    customerDiagnostics.likely_mode_mismatch = customerDiagnostics.customer_mode !== customerDiagnostics.stripe_mode;
  }

  const subscriptionDiagnostics = list.data.map((subscription) => {
    const normalizedStatus = normalizeStatus(subscription.status);
    const customer_id = toSubscriptionCustomerId(subscription);
    return {
      subscription_id: subscription.id,
      status: normalizedStatus || "unknown",
      customer_id,
      livemode: Boolean(subscription.livemode),
      metadata_shop_id: String(subscription.metadata?.shop_id ?? "").trim() || null,
      excluded_reasons: detectExclusionReasons({
        subscription,
        expectedCustomerId: customerId,
      }),
    } satisfies SubscriptionDiagnosticEntry;
  });

  const managedIds = subscriptionDiagnostics
    .filter((entry) => entry.excluded_reasons.every((reason) => reason !== "status_not_managed"))
    .map((entry) => entry.subscription_id);

  const singleHydratable = subscriptionDiagnostics.filter(
    (entry) =>
      entry.excluded_reasons.every(
        (reason) => reason !== "status_not_single_subscription_hydratable" && reason !== "subscription_customer_mismatch",
      ),
  );

  return {
    customer: customerDiagnostics,
    all_subscription_ids: allIds,
    managed_subscription_ids: managedIds,
    single_hydratable_subscription_id: singleHydratable.length === 1 ? singleHydratable[0]?.subscription_id ?? null : null,
    subscription_diagnostics: subscriptionDiagnostics,
    no_subscriptions_found: allIds.length === 0,
    subscriptions_exist_but_none_managed: allIds.length > 0 && managedIds.length === 0,
  };
}

export function isManagedSubscriptionStatus(status: unknown): boolean {
  return MANAGED_SUBSCRIPTION_STATUSES.has(normalizeStatus(status));
}

export function isSingleSubscriptionHydratableStatus(status: unknown): boolean {
  return HYDRATABLE_SINGLE_SUBSCRIPTION_STATUSES.has(normalizeStatus(status));
}
