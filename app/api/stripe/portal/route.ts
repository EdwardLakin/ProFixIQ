export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createStripeClient } from "@/features/stripe/lib/stripe/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { OWNER_PIN_PURPOSES } from "@/features/shared/lib/server/owner-pin";
import { getProfileStripeArtifacts } from "@/features/stripe/lib/server/canonical-shop-billing";

type DB = Database;

type ShopScope = Pick<
  DB["public"]["Tables"]["shops"]["Row"],
  "id" | "email" | "shop_name" | "name" | "stripe_customer_id"
>;

function mustEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function getSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SHOP_BOOST_APP_BASE_URL?.trim() ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

function getShopDisplayName(shop: { shop_name?: string | null; name?: string | null }): string {
  return (shop.shop_name ?? shop.name ?? "").trim() || "ProFixIQ Shop";
}

async function createCustomerIfMissing(
  stripe: Stripe,
  supabase: SupabaseClient<DB>,
  shop: ShopScope,
): Promise<string> {
  const existingCustomerId = (shop.stripe_customer_id ?? "").trim();
  if (existingCustomerId) return existingCustomerId;

  const customer = await stripe.customers.create({
    email: shop.email ?? undefined,
    name: getShopDisplayName(shop),
    metadata: {
      shop_id: shop.id,
      source: "profixiq",
    },
  });

  const { error: updateError } = await supabase
    .from("shops")
    .update({
      stripe_customer_id: customer.id,
    } as DB["public"]["Tables"]["shops"]["Update"])
    .eq("id", shop.id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return customer.id;
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
      .select("id, email, shop_name, name, stripe_customer_id")
      .eq("id", access.profile.shop_id)
      .maybeSingle<ShopScope>();

    if (shopError) {
      return NextResponse.json({ error: shopError.message }, { status: 500 });
    }

    if (!shop) {
      return NextResponse.json({ error: "Shop not found." }, { status: 404 });
    }

    if (!String(shop.stripe_customer_id ?? "").trim()) {
      const profile = await getProfileStripeArtifacts(access.supabase, access.profile.id);
      const profileCustomerId = String(profile?.stripe_customer_id ?? "").trim();
      const profileSubscriptionId = String(profile?.stripe_subscription_id ?? "").trim();

      if (profileCustomerId || profileSubscriptionId) {
        return NextResponse.json(
          {
            error: "Billing linkage is required before opening the portal.",
            linkage_needed: true,
            linkage_state: "unlinked_subscription",
            linked_customer_id: profileCustomerId || null,
            linked_subscription_id: profileSubscriptionId || null,
          },
          { status: 409 },
        );
      }
    }

    const customerId = await createCustomerIfMissing(stripe, access.supabase, shop);
    const returnUrl = `${getSiteUrl()}/dashboard/owner/settings#billing`;

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return NextResponse.json({
      ok: true,
      customerId,
      url: session.url,
      returnUrl,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create billing portal session.";

    console.error("[stripe/portal] error", error);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
