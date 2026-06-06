export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createStripeClient } from "@/features/stripe/lib/stripe/client";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

import type { Database } from "@shared/types/types/supabase";
import { getActorCapabilities } from "@/features/shared/lib/rbac";

type DB = Database;

type ProfileScope = Pick<
  DB["public"]["Tables"]["profiles"]["Row"],
  "id" | "role" | "shop_id"
>;

type ShopScope = Pick<
  DB["public"]["Tables"]["shops"]["Row"],
  "id" | "country" | "timezone" | "shop_name" | "name" | "stripe_account_id"
>;


function mustEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function normalizeCountry(value: string | null | undefined): "US" | "CA" {
  return String(value ?? "")
    .trim()
    .toUpperCase() === "CA"
    ? "CA"
    : "US";
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

export async function POST() {
  try {
    const stripe = createStripeClient(mustEnv("STRIPE_SECRET_KEY"));

    const supabase = createServerSupabaseRoute();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role, shop_id")
      .eq("id", user.id)
      .maybeSingle<ProfileScope>();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    if (!profile?.shop_id) {
      return NextResponse.json({ error: "No shop found for this account." }, { status: 400 });
    }

    const actor = getActorCapabilities({ role: profile.role });
    if (!actor.isKnownRole || !actor.canManageBilling) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: shop, error: shopError } = await supabase
      .from("shops")
      .select("id, country, timezone, shop_name, name, stripe_account_id")
      .eq("id", profile.shop_id)
      .maybeSingle<ShopScope>();

    if (shopError) {
      return NextResponse.json({ error: shopError.message }, { status: 500 });
    }

    if (!shop) {
      return NextResponse.json({ error: "Shop not found." }, { status: 404 });
    }

    const siteUrl = getSiteUrl();
    const settingsUrl = `${siteUrl}/dashboard/owner/settings#billing`;
    const country = normalizeCountry(shop.country);
    const displayName = getShopDisplayName(shop);

    let stripeAccountId = (shop.stripe_account_id ?? "").trim();
    let created = false;

    if (!stripeAccountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country,
        business_type: "company",
        business_profile: {
          name: displayName,
        },
        metadata: {
          shop_id: shop.id,
          source: "profixiq",
        },
      });

      stripeAccountId = account.id;
      created = true;

      const { error: updateError } = await supabase
        .from("shops")
        .update({
          stripe_account_id: stripeAccountId,
        } as DB["public"]["Tables"]["shops"]["Update"])
        .eq("id", shop.id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
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
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create Stripe onboarding link.";

    console.error("[stripe/connect/onboard] error", error);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
