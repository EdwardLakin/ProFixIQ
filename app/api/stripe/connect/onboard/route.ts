export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createStripeClient } from "@/features/stripe/lib/stripe/client";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";
import { saveShopPaymentSettings } from "@/features/stripe/lib/server/shop-payment-settings";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type DB = Database;

type ShopScope = Pick<
  DB["public"]["Tables"]["shops"]["Row"],
  "id" | "country" | "timezone" | "shop_name" | "name" | "stripe_account_id"
>;

type ConnectController = {
  fees?: { payer?: string | null } | null;
  losses?: { payments?: string | null } | null;
  stripe_dashboard?: { type?: string | null } | null;
  requirement_collection?: string | null;
};

function mustEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) throw new Error(`Missing required env: ${name}`);
  return value;
}

function normalizeCountry(value: string | null | undefined): "US" | "CA" {
  return String(value ?? "").trim().toUpperCase() === "CA" ? "CA" : "US";
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

function readController(account: Stripe.Account): ConnectController {
  return ((account as Stripe.Account & { controller?: ConnectController }).controller ?? {});
}

function isDirectChargeAccount(account: Stripe.Account): boolean {
  const controller = readController(account);
  return (
    controller.fees?.payer === "account" &&
    controller.losses?.payments === "stripe" &&
    controller.stripe_dashboard?.type === "full" &&
    controller.requirement_collection === "stripe"
  );
}

export async function POST() {
  try {
    const access = await requireShopScopedApiAccess({
      requiredCapability: "canManageBilling",
      allowRoles: ["owner", "admin"],
    });
    if (!access.ok) return access.response;

    const stripe = createStripeClient(mustEnv("STRIPE_SECRET_KEY"));
    const supabase = access.supabase;

    const { data: shop, error: shopError } = await supabase
      .from("shops")
      .select("id, country, timezone, shop_name, name, stripe_account_id")
      .eq("id", access.profile.shop_id)
      .maybeSingle<ShopScope>();
    if (shopError) {
      return NextResponse.json({ error: shopError.message }, { status: 500 });
    }
    if (!shop) {
      return NextResponse.json({ error: "Shop not found." }, { status: 404 });
    }

    const siteUrl = getSiteUrl();
    const settingsUrl = `${siteUrl}/dashboard/owner/settings#payments`;
    const country = normalizeCountry(shop.country);
    const displayName = getShopDisplayName(shop);
    const admin = createAdminSupabase();

    let stripeAccountId = (shop.stripe_account_id ?? "").trim();
    let account: Stripe.Account;
    let created = false;

    if (stripeAccountId) {
      account = await stripe.accounts.retrieve(stripeAccountId);
      if (!isDirectChargeAccount(account)) {
        return NextResponse.json(
          {
            error:
              "This shop has a legacy Stripe connection. It must be migrated before portal payments can be enabled.",
            migration_required: true,
            stripeAccountId,
          },
          { status: 409 },
        );
      }
    } else {
      const accountParams = {
        country,
        business_type: "company",
        business_profile: { name: displayName },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
          ...(country === "CA" ? { acss_debit_payments: { requested: true } } : {}),
        },
        controller: {
          fees: { payer: "account" },
          losses: { payments: "stripe" },
          requirement_collection: "stripe",
          stripe_dashboard: { type: "full" },
        },
        metadata: {
          app: "profixiq",
          shop_id: shop.id,
          source: "profixiq",
          charge_model: "direct",
        },
      } as unknown as Stripe.AccountCreateParams;

      account = await stripe.accounts.create(accountParams);
      stripeAccountId = account.id;
      created = true;

      const { error: updateError } = await admin
        .from("shops")
        .update({
          stripe_account_id: stripeAccountId,
          stripe_charges_enabled: Boolean(account.charges_enabled),
          stripe_payouts_enabled: Boolean(account.payouts_enabled),
          stripe_details_submitted: Boolean(account.details_submitted),
          stripe_onboarding_completed: Boolean(
            account.charges_enabled && account.payouts_enabled && account.details_submitted,
          ),
          stripe_connect_charge_model: "direct",
          stripe_connect_dashboard_type: "full",
          stripe_connect_fees_collector: "stripe",
          stripe_connect_losses_collector: "stripe",
        } as DB["public"]["Tables"]["shops"]["Update"])
        .eq("id", shop.id);
      if (updateError) throw new Error(updateError.message);

      await saveShopPaymentSettings(admin, shop.id, {
        default_currency: country === "CA" ? "cad" : "usd",
        portal_payments_enabled: false,
      });
    }

    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: settingsUrl,
      return_url: settingsUrl,
      type: "account_onboarding",
    });

    return NextResponse.json({
      ok: true,
      created,
      stripeAccountId,
      onboardingUrl: accountLink.url,
      settingsUrl,
      country,
      chargeModel: "direct",
      dashboardType: "full",
      feesCollector: "stripe",
      lossesCollector: "stripe",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create Stripe onboarding link.";
    console.error("[stripe/connect/onboard] error", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
