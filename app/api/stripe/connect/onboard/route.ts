import { NextResponse } from "next/server";
import Stripe from "stripe";
import { cookies as nextCookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2024-04-10" as Stripe.LatestApiVersion,
});

const ADMIN_ROLES = new Set<string>(["owner", "admin", "manager"]);

function getBaseUrl(): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (site) return site.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

type Payload = {
  shopId?: string;
};

type ProfileScope = {
  role: string | null;
  shop_id: string | null;
};

export async function POST(req: Request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });
    }

    const supabase = createRouteHandlerClient<DB>({ cookies: nextCookies });

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as Payload | null;
    const shopId = body?.shopId ?? null;
    if (!shopId) {
      return NextResponse.json({ error: "Missing shopId" }, { status: 400 });
    }

    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("role, shop_id")
      .eq("id", user.id)
      .maybeSingle<ProfileScope>();

    if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });
    if (!prof?.shop_id || prof.shop_id !== shopId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const role = String(prof.role ?? "").toLowerCase();
    if (!ADMIN_ROLES.has(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Load shop
    const { data: shop, error: shopErr } = await supabase
      .from("shops")
      .select("id, email, phone_number, business_name, shop_name, name, stripe_account_id, stripe_default_currency")
      .eq("id", shopId)
      .maybeSingle<{
        id: string;
        email: string | null;
        phone_number: string | null;
        business_name: string | null;
        shop_name: string | null;
        name: string | null;
        stripe_account_id: string | null;
        stripe_default_currency: string | null;
      }>();

    if (shopErr) return NextResponse.json({ error: shopErr.message }, { status: 500 });
    if (!shop) return NextResponse.json({ error: "Shop not found" }, { status: 404 });

    const displayName =
      shop.shop_name?.trim() ||
      shop.name?.trim() ||
      shop.business_name?.trim() ||
      "ProFixIQ Shop";

    let accountId = shop.stripe_account_id?.trim() ?? null;

    // Create account if missing
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "US", // Stripe Connect country of account holder — keep US default unless you plan CA accounts.
        email: shop.email ?? undefined,
        business_profile: {
          name: displayName,
          product_description: "Auto repair services",
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: {
          shop_id: shopId,
        },
        settings: {
          payouts: {
            schedule: { interval: "daily" },
          },
        },
      });

      accountId = account.id;

      const { error: updErr } = await supabase
        .from("shops")
        .update({ stripe_account_id: accountId } as DB["public"]["Tables"]["shops"]["Update"])
        .eq("id", shopId);

      if (updErr) {
        return NextResponse.json({ error: updErr.message }, { status: 500 });
      }
    }

    const base = getBaseUrl();

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${base}/dashboard/owner/settings?stripe=refresh`,
      return_url: `${base}/dashboard/owner/settings?stripe=return`,
      type: "account_onboarding",
    });

    return NextResponse.json({ url: link.url }, { status: 200 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}