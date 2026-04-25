export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createStripeClient } from "@/features/stripe/lib/stripe/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { OWNER_PIN_PURPOSES } from "@/features/shared/lib/server/owner-pin";
import {
  getProfileStripeArtifacts,
  resolveCanonicalPlanFromSubscription,
  toCanonicalShopBillingUpdate,
} from "@/features/stripe/lib/server/canonical-shop-billing";
import { collectCustomerSubscriptionDiagnostics } from "@/features/stripe/lib/server/subscription-discovery";

type DB = Database;

type ShopStripeScope = Pick<
  DB["public"]["Tables"]["shops"]["Row"],
  | "id"
  | "stripe_customer_id"
  | "stripe_subscription_id"
  | "stripe_subscription_status"
  | "stripe_current_period_end"
  | "stripe_trial_end"
>;

type NormalizedSubscriptionPayload = {
  success: boolean;
  status: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  current_period_end: string | null;
  trial_end: string | null;
  resolved_plan?: string | null;
  linkage_needed?: boolean;
  linkage_state?:
    | "no_subscription_found"
    | "ambiguous_customer_subscriptions"
    | "subscription_found_not_linked"
    | "metadata_mismatch"
    | "sync_needed"
    | "linked_and_synced";
  sync_performed?: boolean;
  sync_skipped_reason?: string | null;
  linked_customer_id?: string | null;
  linked_subscription_id?: string | null;
  linked_checkout_session_id?: string | null;
  matching_subscription_ids?: string[];
  managed_subscription_ids?: string[];
  resolved_subscription_id?: string | null;
  all_customer_subscription_ids?: string[];
  subscription_diagnostics?: Array<{
    subscription_id: string;
    status: string;
    customer_id: string | null;
    livemode: boolean;
    metadata_shop_id: string | null;
    excluded_reasons: string[];
  }>;
  customer_exists_in_stripe?: boolean;
  customer_deleted_in_stripe?: boolean;
  customer_lookup_error?: string | null;
  likely_mode_mismatch?: boolean;
  stripe_mode?: "live" | "test" | "unknown";
  customer_mode?: "live" | "test" | "unknown";
  hydration_strategy?: "managed_filter" | "single_hydratable_subscription" | "none";
};

type CanonicalSubscriptionResolution =
  | {
      state: "resolved";
      subscription: Stripe.Subscription;
      metadataMatches: boolean;
      managedSubscriptionIds: string[];
      allSubscriptionIds: string[];
      subscriptionDiagnostics: NormalizedSubscriptionPayload["subscription_diagnostics"];
      customerDiagnostics: {
        customer_exists_in_stripe: boolean;
        customer_deleted_in_stripe: boolean;
        customer_lookup_error: string | null;
        likely_mode_mismatch: boolean;
        stripe_mode: "live" | "test" | "unknown";
        customer_mode: "live" | "test" | "unknown";
      };
      hydrationStrategy: "managed_filter" | "single_hydratable_subscription";
    }
  | {
      state: "no_subscription_found";
      managedSubscriptionIds: string[];
      allSubscriptionIds: string[];
      subscriptionDiagnostics: NormalizedSubscriptionPayload["subscription_diagnostics"];
      customerDiagnostics: {
        customer_exists_in_stripe: boolean;
        customer_deleted_in_stripe: boolean;
        customer_lookup_error: string | null;
        likely_mode_mismatch: boolean;
        stripe_mode: "live" | "test" | "unknown";
        customer_mode: "live" | "test" | "unknown";
      };
    }
  | {
      state: "ambiguous_customer_subscriptions";
      subscriptionIds: string[];
      allSubscriptionIds: string[];
      subscriptionDiagnostics: NormalizedSubscriptionPayload["subscription_diagnostics"];
      customerDiagnostics: {
        customer_exists_in_stripe: boolean;
        customer_deleted_in_stripe: boolean;
        customer_lookup_error: string | null;
        likely_mode_mismatch: boolean;
        stripe_mode: "live" | "test" | "unknown";
        customer_mode: "live" | "test" | "unknown";
      };
    };

function mustEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function unixToIsoOrNull(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return new Date(value * 1000).toISOString();
}

function normalizeSubscription(subscription: Stripe.Subscription): NormalizedSubscriptionPayload {
  return {
    success: true,
    status: String(subscription.status ?? "").trim() || null,
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    canceled_at: unixToIsoOrNull(subscription.canceled_at ?? null),
    current_period_end: unixToIsoOrNull(subscription.current_period_end ?? null),
    trial_end: unixToIsoOrNull(subscription.trial_end ?? null),
    resolved_plan: resolveCanonicalPlanFromSubscription(subscription),
  };
}

function normalizeShopFallback(shop: ShopStripeScope): NormalizedSubscriptionPayload {
  return {
    success: true,
    status: String(shop.stripe_subscription_status ?? "").trim() || null,
    cancel_at_period_end: false,
    canceled_at: null,
    current_period_end: shop.stripe_current_period_end ?? null,
    trial_end: shop.stripe_trial_end ?? null,
  };
}

function subscriptionMetadataMatchesShop(subscription: Stripe.Subscription, shop: ShopStripeScope): boolean {
  const customerId = String(shop.stripe_customer_id ?? "").trim();
  const subscriptionCustomerId =
    typeof subscription.customer === "string" ? subscription.customer : String(subscription.customer?.id ?? "").trim();
  const metadataShopId = String(subscription.metadata?.shop_id ?? "").trim();
  const customerMatches = !customerId || subscriptionCustomerId === customerId;
  const metadataMatches = metadataShopId === "" || metadataShopId === shop.id;
  return customerMatches && metadataMatches;
}

async function findCanonicalSubscription(
  stripe: Stripe,
  shop: ShopStripeScope,
): Promise<CanonicalSubscriptionResolution> {
  const subscriptionId = String(shop.stripe_subscription_id ?? "").trim();
  const customerId = String(shop.stripe_customer_id ?? "").trim();
  let linkedSubscriptionMismatchDiagnostic: NormalizedSubscriptionPayload["subscription_diagnostics"] = [];

  if (subscriptionId) {
    try {
      const byId = await stripe.subscriptions.retrieve(subscriptionId);
      if (subscriptionMetadataMatchesShop(byId, shop)) {
        return {
          state: "resolved",
          subscription: byId,
          metadataMatches: true,
          managedSubscriptionIds: [byId.id],
          allSubscriptionIds: [byId.id],
          subscriptionDiagnostics: [
            {
              subscription_id: byId.id,
              status: String(byId.status ?? "").trim().toLowerCase() || "unknown",
              customer_id:
                typeof byId.customer === "string" ? byId.customer : String(byId.customer?.id ?? "") || null,
              livemode: Boolean(byId.livemode),
              metadata_shop_id: String(byId.metadata?.shop_id ?? "").trim() || null,
              excluded_reasons: [],
            },
          ],
          customerDiagnostics: {
            customer_exists_in_stripe: true,
            customer_deleted_in_stripe: false,
            customer_lookup_error: null,
            likely_mode_mismatch: false,
            stripe_mode: byId.livemode ? "live" : "test",
            customer_mode: "unknown",
          },
          hydrationStrategy: "managed_filter",
        };
      }
      linkedSubscriptionMismatchDiagnostic = [
        {
          subscription_id: byId.id,
          status: String(byId.status ?? "").trim().toLowerCase() || "unknown",
          customer_id: typeof byId.customer === "string" ? byId.customer : String(byId.customer?.id ?? "") || null,
          livemode: Boolean(byId.livemode),
          metadata_shop_id: String(byId.metadata?.shop_id ?? "").trim() || null,
          excluded_reasons: ["subscription_id_mismatch_with_shop_customer_or_metadata"],
        },
      ];
    } catch {
      // Ignore retrieve failures and continue with deterministic customer-based diagnostics.
    }
  }

  if (!customerId) {
    return {
      state: "no_subscription_found",
      managedSubscriptionIds: [],
      allSubscriptionIds: [],
      subscriptionDiagnostics: [],
      customerDiagnostics: {
        customer_exists_in_stripe: false,
        customer_deleted_in_stripe: false,
        customer_lookup_error: null,
        likely_mode_mismatch: false,
        stripe_mode: "unknown",
        customer_mode: "unknown",
      },
    };
  }

  const diagnostics = await collectCustomerSubscriptionDiagnostics({
    stripe,
    customerId,
  });

  if (diagnostics.managed_subscription_ids.length === 1) {
    const managedSub = await stripe.subscriptions.retrieve(diagnostics.managed_subscription_ids[0]!);
    return {
      state: "resolved",
      subscription: managedSub,
      metadataMatches: subscriptionMetadataMatchesShop(managedSub, shop),
      managedSubscriptionIds: diagnostics.managed_subscription_ids,
      allSubscriptionIds: diagnostics.all_subscription_ids,
      subscriptionDiagnostics: [...(linkedSubscriptionMismatchDiagnostic ?? []), ...diagnostics.subscription_diagnostics],
      customerDiagnostics: {
        customer_exists_in_stripe: diagnostics.customer.customer_exists,
        customer_deleted_in_stripe: diagnostics.customer.customer_deleted,
        customer_lookup_error: diagnostics.customer.customer_lookup_error,
        likely_mode_mismatch: diagnostics.customer.likely_mode_mismatch,
        stripe_mode: diagnostics.customer.stripe_mode,
        customer_mode: diagnostics.customer.customer_mode,
      },
      hydrationStrategy: "managed_filter",
    };
  }

  if (diagnostics.managed_subscription_ids.length === 0 && diagnostics.single_hydratable_subscription_id) {
    const hydratableSub = await stripe.subscriptions.retrieve(diagnostics.single_hydratable_subscription_id);
    return {
      state: "resolved",
      subscription: hydratableSub,
      metadataMatches: subscriptionMetadataMatchesShop(hydratableSub, shop),
      managedSubscriptionIds: diagnostics.managed_subscription_ids,
      allSubscriptionIds: diagnostics.all_subscription_ids,
      subscriptionDiagnostics: [...(linkedSubscriptionMismatchDiagnostic ?? []), ...diagnostics.subscription_diagnostics],
      customerDiagnostics: {
        customer_exists_in_stripe: diagnostics.customer.customer_exists,
        customer_deleted_in_stripe: diagnostics.customer.customer_deleted,
        customer_lookup_error: diagnostics.customer.customer_lookup_error,
        likely_mode_mismatch: diagnostics.customer.likely_mode_mismatch,
        stripe_mode: diagnostics.customer.stripe_mode,
        customer_mode: diagnostics.customer.customer_mode,
      },
      hydrationStrategy: "single_hydratable_subscription",
    };
  }

  if (diagnostics.managed_subscription_ids.length > 1) {
    return {
      state: "ambiguous_customer_subscriptions",
      subscriptionIds: diagnostics.managed_subscription_ids,
      allSubscriptionIds: diagnostics.all_subscription_ids,
      subscriptionDiagnostics: [...(linkedSubscriptionMismatchDiagnostic ?? []), ...diagnostics.subscription_diagnostics],
      customerDiagnostics: {
        customer_exists_in_stripe: diagnostics.customer.customer_exists,
        customer_deleted_in_stripe: diagnostics.customer.customer_deleted,
        customer_lookup_error: diagnostics.customer.customer_lookup_error,
        likely_mode_mismatch: diagnostics.customer.likely_mode_mismatch,
        stripe_mode: diagnostics.customer.stripe_mode,
        customer_mode: diagnostics.customer.customer_mode,
      },
    };
  }

  return {
    state: "no_subscription_found",
    managedSubscriptionIds: diagnostics.managed_subscription_ids,
    allSubscriptionIds: diagnostics.all_subscription_ids,
    subscriptionDiagnostics: [...(linkedSubscriptionMismatchDiagnostic ?? []), ...diagnostics.subscription_diagnostics],
    customerDiagnostics: {
      customer_exists_in_stripe: diagnostics.customer.customer_exists,
      customer_deleted_in_stripe: diagnostics.customer.customer_deleted,
      customer_lookup_error: diagnostics.customer.customer_lookup_error,
      likely_mode_mismatch: diagnostics.customer.likely_mode_mismatch,
      stripe_mode: diagnostics.customer.stripe_mode,
      customer_mode: diagnostics.customer.customer_mode,
    },
  };
}

async function findUnlinkedSubscriptionEvidence(args: {
  stripe: Stripe;
  supabase: SupabaseClient<DB>;
  userId: string;
  shop: ShopStripeScope;
}): Promise<{ customerId: string | null; subscriptionId: string | null; checkoutSessionId: string | null } | null> {
  const { stripe, supabase, userId, shop } = args;
  const profile = await getProfileStripeArtifacts(supabase, userId);
  if (!profile) return null;

  const profileCustomerId = String(profile.stripe_customer_id ?? "").trim() || null;
  const profileSubscriptionId = String(profile.stripe_subscription_id ?? "").trim() || null;
  const profileCheckoutSessionId = String(profile.stripe_checkout_session_id ?? "").trim() || null;

  const canonicalCustomerId = String(shop.stripe_customer_id ?? "").trim() || null;
  const canonicalSubscriptionId = String(shop.stripe_subscription_id ?? "").trim() || null;

  if (!profileCustomerId && !profileSubscriptionId && !profileCheckoutSessionId) return null;

  if (
    profileCustomerId &&
    canonicalCustomerId &&
    profileCustomerId === canonicalCustomerId &&
    profileSubscriptionId &&
    canonicalSubscriptionId &&
    profileSubscriptionId === canonicalSubscriptionId
  ) {
    return null;
  }

  if (profileSubscriptionId) {
    const sub = await stripe.subscriptions.retrieve(profileSubscriptionId);
    const subscriptionCustomerId =
      typeof sub.customer === "string" ? sub.customer : String(sub.customer?.id ?? "").trim() || null;
    return {
      customerId: profileCustomerId ?? subscriptionCustomerId,
      subscriptionId: sub.id,
      checkoutSessionId: profileCheckoutSessionId,
    };
  }

  if (profileCustomerId) {
    const list = await stripe.subscriptions.list({
      customer: profileCustomerId,
      status: "all",
      limit: 5,
    });
    const latest = [...list.data].sort((a, b) => (b.created ?? 0) - (a.created ?? 0))[0] ?? null;
    if (latest) {
      return { customerId: profileCustomerId, subscriptionId: latest.id, checkoutSessionId: profileCheckoutSessionId };
    }
    return { customerId: profileCustomerId, subscriptionId: null, checkoutSessionId: profileCheckoutSessionId };
  }

  if (profileCheckoutSessionId) {
    const session = await stripe.checkout.sessions.retrieve(profileCheckoutSessionId);
    const customerId =
      typeof session.customer === "string" ? session.customer : null;
    const subscriptionId =
      typeof session.subscription === "string" ? session.subscription : null;
    return {
      customerId,
      subscriptionId,
      checkoutSessionId: profileCheckoutSessionId,
    };
  }

  return null;
}

async function syncShopSubscription(
  supabase: SupabaseClient<DB>,
  shopId: string,
  subscription: Stripe.Subscription,
) {
  const stripeCustomerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : String(subscription.customer?.id ?? "").trim() || null;

  const { error } = await supabase
    .from("shops")
    .update(
      toCanonicalShopBillingUpdate({
        customerId: stripeCustomerId,
        subscription,
      }),
    )
    .eq("id", shopId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function GET() {
  try {
    const stripe = createStripeClient(mustEnv("STRIPE_SECRET_KEY"));
    const access = await requireShopScopedApiAccess({
      requiredCapability: "canManageBilling",
      allowRoles: ["owner", "admin"],
    });
    if (!access.ok) return access.response;

    const { data: shop, error: shopError } = await access.supabase
      .from("shops")
      .select(
        "id, stripe_customer_id, stripe_subscription_id, stripe_subscription_status, stripe_current_period_end, stripe_trial_end",
      )
      .eq("id", access.profile.shop_id)
      .maybeSingle<ShopStripeScope>();

    if (shopError) {
      return NextResponse.json({ error: shopError.message }, { status: 500 });
    }

    if (!shop) {
      return NextResponse.json({ error: "Shop not found." }, { status: 404 });
    }

    const resolution = await findCanonicalSubscription(stripe, shop);

    if (resolution.state === "resolved") {
      await syncShopSubscription(access.supabase, shop.id, resolution.subscription);
      return NextResponse.json({
        ...normalizeSubscription(resolution.subscription),
        linkage_needed: false,
        linkage_state: resolution.metadataMatches ? "linked_and_synced" : "metadata_mismatch",
        sync_performed: true,
        sync_skipped_reason: null,
        linked_customer_id: String(shop.stripe_customer_id ?? "").trim() || null,
        linked_subscription_id: resolution.subscription.id,
        linked_checkout_session_id: null,
        matching_subscription_ids: [resolution.subscription.id],
        managed_subscription_ids: resolution.managedSubscriptionIds,
        resolved_subscription_id: resolution.subscription.id,
        all_customer_subscription_ids: resolution.allSubscriptionIds,
        subscription_diagnostics: resolution.subscriptionDiagnostics,
        customer_exists_in_stripe: resolution.customerDiagnostics.customer_exists_in_stripe,
        customer_deleted_in_stripe: resolution.customerDiagnostics.customer_deleted_in_stripe,
        customer_lookup_error: resolution.customerDiagnostics.customer_lookup_error,
        likely_mode_mismatch: resolution.customerDiagnostics.likely_mode_mismatch,
        stripe_mode: resolution.customerDiagnostics.stripe_mode,
        customer_mode: resolution.customerDiagnostics.customer_mode,
        hydration_strategy: resolution.hydrationStrategy,
      } satisfies NormalizedSubscriptionPayload);
    }

    if (resolution.state === "ambiguous_customer_subscriptions") {
      return NextResponse.json({
        ...normalizeShopFallback(shop),
        linkage_needed: true,
        linkage_state: "ambiguous_customer_subscriptions",
        sync_performed: false,
        sync_skipped_reason: "ambiguous_customer_subscriptions",
        linked_customer_id: String(shop.stripe_customer_id ?? "").trim() || null,
        linked_subscription_id: null,
        linked_checkout_session_id: null,
        matching_subscription_ids: [],
        managed_subscription_ids: resolution.subscriptionIds,
        resolved_subscription_id: null,
        all_customer_subscription_ids: resolution.allSubscriptionIds,
        subscription_diagnostics: resolution.subscriptionDiagnostics,
        customer_exists_in_stripe: resolution.customerDiagnostics.customer_exists_in_stripe,
        customer_deleted_in_stripe: resolution.customerDiagnostics.customer_deleted_in_stripe,
        customer_lookup_error: resolution.customerDiagnostics.customer_lookup_error,
        likely_mode_mismatch: resolution.customerDiagnostics.likely_mode_mismatch,
        stripe_mode: resolution.customerDiagnostics.stripe_mode,
        customer_mode: resolution.customerDiagnostics.customer_mode,
        hydration_strategy: "none",
      } satisfies NormalizedSubscriptionPayload);
    }

    if (resolution.state === "no_subscription_found") {
      const unlinked = await findUnlinkedSubscriptionEvidence({
        stripe,
        supabase: access.supabase,
        userId: access.profile.id,
        shop,
      });

      if (unlinked) {
        return NextResponse.json({
          ...normalizeShopFallback(shop),
          linkage_needed: true,
          linkage_state: "subscription_found_not_linked",
          sync_performed: false,
          sync_skipped_reason: "no_customer_subscription_match",
          linked_customer_id: unlinked.customerId,
          linked_subscription_id: unlinked.subscriptionId,
          linked_checkout_session_id: unlinked.checkoutSessionId,
          matching_subscription_ids: unlinked.subscriptionId ? [unlinked.subscriptionId] : [],
          managed_subscription_ids: resolution.managedSubscriptionIds,
          resolved_subscription_id: null,
          all_customer_subscription_ids: resolution.allSubscriptionIds,
          subscription_diagnostics: resolution.subscriptionDiagnostics,
          customer_exists_in_stripe: resolution.customerDiagnostics.customer_exists_in_stripe,
          customer_deleted_in_stripe: resolution.customerDiagnostics.customer_deleted_in_stripe,
          customer_lookup_error: resolution.customerDiagnostics.customer_lookup_error,
          likely_mode_mismatch: resolution.customerDiagnostics.likely_mode_mismatch,
          stripe_mode: resolution.customerDiagnostics.stripe_mode,
          customer_mode: resolution.customerDiagnostics.customer_mode,
          hydration_strategy: "none",
        } satisfies NormalizedSubscriptionPayload);
      }

      return NextResponse.json({
        ...normalizeShopFallback(shop),
        linkage_needed: true,
        linkage_state: "no_subscription_found",
        sync_performed: false,
        sync_skipped_reason: "no_subscription_found",
        linked_customer_id: String(shop.stripe_customer_id ?? "").trim() || null,
        linked_subscription_id: null,
        linked_checkout_session_id: null,
        matching_subscription_ids: [],
        managed_subscription_ids: resolution.managedSubscriptionIds,
        resolved_subscription_id: null,
        all_customer_subscription_ids: resolution.allSubscriptionIds,
        subscription_diagnostics: resolution.subscriptionDiagnostics,
        customer_exists_in_stripe: resolution.customerDiagnostics.customer_exists_in_stripe,
        customer_deleted_in_stripe: resolution.customerDiagnostics.customer_deleted_in_stripe,
        customer_lookup_error: resolution.customerDiagnostics.customer_lookup_error,
        likely_mode_mismatch: resolution.customerDiagnostics.likely_mode_mismatch,
        stripe_mode: resolution.customerDiagnostics.stripe_mode,
        customer_mode: resolution.customerDiagnostics.customer_mode,
        hydration_strategy: "none",
      } satisfies NormalizedSubscriptionPayload);
    }

    return NextResponse.json(normalizeShopFallback(shop));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to resolve subscription.";
    console.error("[stripe/subscription:get] error", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const stripe = createStripeClient(mustEnv("STRIPE_SECRET_KEY"));
    const access = await requireShopScopedApiAccess({
      requiredCapability: "canManageBilling",
      allowRoles: ["owner", "admin"],
      requireOwnerPin: true,
      ownerPinRequest: req,
      ownerPinAllowedPurposes: [OWNER_PIN_PURPOSES.BILLING, OWNER_PIN_PURPOSES.PRIVILEGED],
    });
    if (!access.ok) return access.response;

    const { data: shop, error: shopError } = await access.supabase
      .from("shops")
      .select(
        "id, stripe_customer_id, stripe_subscription_id, stripe_subscription_status, stripe_current_period_end, stripe_trial_end",
      )
      .eq("id", access.profile.shop_id)
      .maybeSingle<ShopStripeScope>();

    if (shopError) {
      return NextResponse.json({ error: shopError.message }, { status: 500 });
    }

    if (!shop) {
      return NextResponse.json({ error: "Shop not found." }, { status: 404 });
    }

    const resolution = await findCanonicalSubscription(stripe, shop);

    if (resolution.state !== "resolved") {
      const unlinked = await findUnlinkedSubscriptionEvidence({
        stripe,
        supabase: access.supabase,
        userId: access.profile.id,
        shop,
      });

      if (unlinked) {
        return NextResponse.json(
          {
            error: "Billing linkage is required before managing this subscription.",
            ...normalizeShopFallback(shop),
            linkage_needed: true,
            linkage_state: "subscription_found_not_linked",
            linked_customer_id: unlinked.customerId,
            linked_subscription_id: unlinked.subscriptionId,
            linked_checkout_session_id: unlinked.checkoutSessionId,
          },
          { status: 409 },
        );
      }

      if (resolution.state === "ambiguous_customer_subscriptions") {
        return NextResponse.json(
          {
            error: "Multiple current managed subscriptions were found for this customer.",
            ...normalizeShopFallback(shop),
            linkage_needed: true,
            linkage_state: "ambiguous_customer_subscriptions",
            linked_customer_id: String(shop.stripe_customer_id ?? "").trim() || null,
            linked_subscription_id: null,
            linked_checkout_session_id: null,
            managed_subscription_ids: resolution.subscriptionIds,
          },
          { status: 409 },
        );
      }

      return NextResponse.json(
        {
          error: "No active or trialing subscription was found for this shop.",
          ...normalizeShopFallback(shop),
          linkage_needed: true,
          linkage_state: "no_subscription_found",
          linked_customer_id: String(shop.stripe_customer_id ?? "").trim() || null,
          linked_subscription_id: null,
          linked_checkout_session_id: null,
        },
        { status: 409 },
      );
    }

    const canonicalSubscription = resolution.subscription;

    if (canonicalSubscription.status !== "active" && canonicalSubscription.status !== "trialing") {
      return NextResponse.json(
        {
          error: "Only active or trialing subscriptions can be scheduled for cancellation.",
          ...normalizeSubscription(canonicalSubscription),
        },
        { status: 409 },
      );
    }

    if (canonicalSubscription.cancel_at_period_end) {
      await syncShopSubscription(access.supabase, shop.id, canonicalSubscription);
      return NextResponse.json(normalizeSubscription(canonicalSubscription));
    }

    const updated = await stripe.subscriptions.update(canonicalSubscription.id, {
      cancel_at_period_end: true,
    });

    await syncShopSubscription(access.supabase, shop.id, updated);

    return NextResponse.json(normalizeSubscription(updated));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to schedule cancellation.";
    console.error("[stripe/subscription:cancel] error", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
