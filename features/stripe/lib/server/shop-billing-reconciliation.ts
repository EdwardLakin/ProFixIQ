import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { toCanonicalShopBillingUpdate } from "@/features/stripe/lib/server/canonical-shop-billing";
import { collectCustomerSubscriptionDiagnostics } from "@/features/stripe/lib/server/subscription-discovery";

type DB = Database;

type ShopBillingRow = Pick<
  DB["public"]["Tables"]["shops"]["Row"],
  | "id"
  | "stripe_customer_id"
  | "stripe_subscription_id"
  | "stripe_subscription_status"
  | "stripe_trial_end"
  | "stripe_current_period_end"
  | "plan"
>;

export type ShopBillingReconciliationState =
  | "updated"
  | "already_hydrated"
  | "no_subscription_found"
  | "ambiguous_customer_subscriptions"
  | "shop_not_found"
  | "missing_customer_id"
  | "customer_id_mismatch";

export type ShopBillingReconciliationResult = {
  state: ShopBillingReconciliationState;
  shop_id: string;
  stripe_customer_id: string | null;
  qualifying_subscription_ids: string[];
  chosen_subscription_id: string | null;
  derived_plan: string | null;
  update_applied: boolean;
  reason?: string;
  all_customer_subscription_ids: string[];
  subscription_diagnostics: Array<{
    subscription_id: string;
    status: string;
    customer_id: string | null;
    livemode: boolean;
    metadata_shop_id: string | null;
    excluded_reasons: string[];
  }>;
  has_any_customer_subscriptions: boolean;
  subscriptions_exist_but_none_managed: boolean;
  customer_exists_in_stripe: boolean;
  customer_deleted_in_stripe: boolean;
  customer_lookup_error: string | null;
  likely_mode_mismatch: boolean;
  stripe_mode: "live" | "test" | "unknown";
  customer_mode: "live" | "test" | "unknown";
  hydration_strategy: "managed_filter" | "single_hydratable_subscription" | "none";
};

function normalizeText(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function isSameCanonicalState(
  shop: ShopBillingRow,
  update: DB["public"]["Tables"]["shops"]["Update"],
): boolean {
  return (
    normalizeText(shop.stripe_subscription_id) === normalizeText(update.stripe_subscription_id) &&
    normalizeText(shop.stripe_subscription_status) === normalizeText(update.stripe_subscription_status) &&
    normalizeText(shop.stripe_trial_end) === normalizeText(update.stripe_trial_end) &&
    normalizeText(shop.stripe_current_period_end) === normalizeText(update.stripe_current_period_end) &&
    normalizeText(shop.plan) === normalizeText(update.plan)
  );
}

export async function reconcileCanonicalShopBillingByShopId(params: {
  stripe: Stripe;
  supabase: SupabaseClient<DB>;
  shopId: string;
  expectedCustomerId?: string | null;
  applyUpdate?: boolean;
}): Promise<ShopBillingReconciliationResult> {
  const { stripe, supabase, shopId, expectedCustomerId = null, applyUpdate = true } = params;

  const { data: shop, error: shopError } = await supabase
    .from("shops")
    .select(
      "id, stripe_customer_id, stripe_subscription_id, stripe_subscription_status, stripe_trial_end, stripe_current_period_end, plan",
    )
    .eq("id", shopId)
    .maybeSingle<ShopBillingRow>();

  if (shopError) {
    throw new Error(shopError.message);
  }

  if (!shop) {
    return {
      state: "shop_not_found",
      shop_id: shopId,
      stripe_customer_id: null,
      qualifying_subscription_ids: [],
      chosen_subscription_id: null,
      derived_plan: null,
      update_applied: false,
      reason: "shop_not_found",
      all_customer_subscription_ids: [],
      subscription_diagnostics: [],
      has_any_customer_subscriptions: false,
      subscriptions_exist_but_none_managed: false,
      customer_exists_in_stripe: false,
      customer_deleted_in_stripe: false,
      customer_lookup_error: null,
      likely_mode_mismatch: false,
      stripe_mode: "unknown",
      customer_mode: "unknown",
      hydration_strategy: "none",
    };
  }

  const stripeCustomerId = normalizeText(shop.stripe_customer_id);
  if (!stripeCustomerId) {
    return {
      state: "missing_customer_id",
      shop_id: shop.id,
      stripe_customer_id: null,
      qualifying_subscription_ids: [],
      chosen_subscription_id: null,
      derived_plan: null,
      update_applied: false,
      reason: "missing_customer_id",
      all_customer_subscription_ids: [],
      subscription_diagnostics: [],
      has_any_customer_subscriptions: false,
      subscriptions_exist_but_none_managed: false,
      customer_exists_in_stripe: false,
      customer_deleted_in_stripe: false,
      customer_lookup_error: null,
      likely_mode_mismatch: false,
      stripe_mode: "unknown",
      customer_mode: "unknown",
      hydration_strategy: "none",
    };
  }

  const expected = normalizeText(expectedCustomerId);
  if (expected && expected !== stripeCustomerId) {
    return {
      state: "customer_id_mismatch",
      shop_id: shop.id,
      stripe_customer_id: stripeCustomerId,
      qualifying_subscription_ids: [],
      chosen_subscription_id: null,
      derived_plan: null,
      update_applied: false,
      reason: "customer_id_mismatch",
      all_customer_subscription_ids: [],
      subscription_diagnostics: [],
      has_any_customer_subscriptions: false,
      subscriptions_exist_but_none_managed: false,
      customer_exists_in_stripe: false,
      customer_deleted_in_stripe: false,
      customer_lookup_error: null,
      likely_mode_mismatch: false,
      stripe_mode: "unknown",
      customer_mode: "unknown",
      hydration_strategy: "none",
    };
  }

  const diagnostics = await collectCustomerSubscriptionDiagnostics({
    stripe,
    customerId: stripeCustomerId,
  });
  let linkedSubscriptionMismatchDiagnostic: ShopBillingReconciliationResult["subscription_diagnostics"] = [];
  const linkedSubscriptionId = normalizeText(shop.stripe_subscription_id);
  if (linkedSubscriptionId) {
    try {
      const linkedSubscription = await stripe.subscriptions.retrieve(linkedSubscriptionId);
      const linkedCustomerId =
        typeof linkedSubscription.customer === "string"
          ? linkedSubscription.customer
          : String(linkedSubscription.customer?.id ?? "").trim() || null;
      const linkedMetadataShopId = String(linkedSubscription.metadata?.shop_id ?? "").trim() || null;
      const customerMatches = linkedCustomerId === stripeCustomerId;
      const metadataMatches = !linkedMetadataShopId || linkedMetadataShopId === shop.id;
      if (!customerMatches || !metadataMatches) {
        linkedSubscriptionMismatchDiagnostic = [
          {
            subscription_id: linkedSubscription.id,
            status: String(linkedSubscription.status ?? "").trim().toLowerCase() || "unknown",
            customer_id: linkedCustomerId,
            livemode: Boolean(linkedSubscription.livemode),
            metadata_shop_id: linkedMetadataShopId,
            excluded_reasons: ["subscription_id_mismatch_with_shop_customer_or_metadata"],
          },
        ];
      }
    } catch {
      // Best-effort diagnostics only.
    }
  }

  const qualifyingIds = diagnostics.managed_subscription_ids;

  let chosenSubscriptionId: string | null = null;
  let hydrationStrategy: ShopBillingReconciliationResult["hydration_strategy"] = "none";

  if (qualifyingIds.length === 1) {
    chosenSubscriptionId = qualifyingIds[0] ?? null;
    hydrationStrategy = "managed_filter";
  } else if (qualifyingIds.length === 0 && diagnostics.single_hydratable_subscription_id) {
    chosenSubscriptionId = diagnostics.single_hydratable_subscription_id;
    hydrationStrategy = "single_hydratable_subscription";
  }

  if (!chosenSubscriptionId) {
    return {
      state:
        qualifyingIds.length > 1
          ? "ambiguous_customer_subscriptions"
          : "no_subscription_found",
      shop_id: shop.id,
      stripe_customer_id: stripeCustomerId,
      qualifying_subscription_ids: qualifyingIds,
      chosen_subscription_id: null,
      derived_plan: null,
      update_applied: false,
      reason:
        qualifyingIds.length > 1
          ? "ambiguous_customer_subscriptions"
          : diagnostics.no_subscriptions_found
            ? "customer_has_no_subscriptions"
            : diagnostics.subscriptions_exist_but_none_managed
              ? "subscriptions_exist_but_none_managed"
              : "no_subscription_found",
      all_customer_subscription_ids: diagnostics.all_subscription_ids,
      subscription_diagnostics: [...linkedSubscriptionMismatchDiagnostic, ...diagnostics.subscription_diagnostics],
      has_any_customer_subscriptions: !diagnostics.no_subscriptions_found,
      subscriptions_exist_but_none_managed: diagnostics.subscriptions_exist_but_none_managed,
      customer_exists_in_stripe: diagnostics.customer.customer_exists,
      customer_deleted_in_stripe: diagnostics.customer.customer_deleted,
      customer_lookup_error: diagnostics.customer.customer_lookup_error,
      likely_mode_mismatch: diagnostics.customer.likely_mode_mismatch,
      stripe_mode: diagnostics.customer.stripe_mode,
      customer_mode: diagnostics.customer.customer_mode,
      hydration_strategy: "none",
    };
  }

  const chosen = await stripe.subscriptions.retrieve(chosenSubscriptionId);

  const canonicalUpdate = toCanonicalShopBillingUpdate({
    customerId: stripeCustomerId,
    subscription: chosen,
  });

  const sameState = isSameCanonicalState(shop, canonicalUpdate);
  const shouldWrite = applyUpdate && !sameState;

  if (shouldWrite) {
    const { error: updateError } = await supabase
      .from("shops")
      .update(canonicalUpdate)
      .eq("id", shop.id);

    if (updateError) {
      throw new Error(updateError.message);
    }
  }

  return {
    state: sameState ? "already_hydrated" : "updated",
    shop_id: shop.id,
    stripe_customer_id: stripeCustomerId,
    qualifying_subscription_ids: qualifyingIds,
    chosen_subscription_id: chosen.id,
    derived_plan: normalizeText(canonicalUpdate.plan),
    update_applied: shouldWrite,
    reason: sameState ? "already_hydrated" : shouldWrite ? "canonical_shop_billing_updated" : "dry_run",
    all_customer_subscription_ids: diagnostics.all_subscription_ids,
    subscription_diagnostics: [...linkedSubscriptionMismatchDiagnostic, ...diagnostics.subscription_diagnostics],
    has_any_customer_subscriptions: !diagnostics.no_subscriptions_found,
    subscriptions_exist_but_none_managed: diagnostics.subscriptions_exist_but_none_managed,
    customer_exists_in_stripe: diagnostics.customer.customer_exists,
    customer_deleted_in_stripe: diagnostics.customer.customer_deleted,
    customer_lookup_error: diagnostics.customer.customer_lookup_error,
    likely_mode_mismatch: diagnostics.customer.likely_mode_mismatch,
    stripe_mode: diagnostics.customer.stripe_mode,
    customer_mode: diagnostics.customer.customer_mode,
    hydration_strategy: hydrationStrategy,
  };
}
