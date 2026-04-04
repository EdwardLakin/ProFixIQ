// app/api/stripe/portal/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { cookies as nextCookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2024-04-10" as Stripe.LatestApiVersion,
});

function getBaseUrl(): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (site) return site.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

type Payload = { shopId?: string };

type ShopRow = {
  id: string;
  stripe_customer_id: string | null;
};

type ProfileRow = {
  id: string;
  shop_id: string | null;
  organization_id: string | null;
};

export async function POST(req: Request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });
    }

    const supabase = createRouteHandlerClient<DB>({ cookies: nextCookies });

    const {
      data: { user },
      error: uErr,
    } = await supabase.auth.getUser();

    if (uErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => null)) as Payload | null;
    const shopId = body?.shopId ?? null;
    if (!shopId) return NextResponse.json({ error: "Missing shopId" }, { status: 400 });

    // Load profile scope
    const { data: prof, error: pErr } = await supabase
      .from("profiles")
      .select("id, shop_id, organization_id")
      .eq("id", user.id)
      .maybeSingle<ProfileRow>();

    if (pErr || !prof) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    // Load shop + enforce scope:
    const { data: shop, error: sErr } = await supabase
      .from("shops")
      .select("id, stripe_customer_id, organization_id")
      .eq("id", shopId)
      .maybeSingle<ShopRow & { organization_id: string | null }>();

    if (sErr || !shop) return NextResponse.json({ error: "Shop not found" }, { status: 404 });

    // Scope rule: allow if same shop OR same organization
    const sameShop = prof.shop_id === shop.id;
    const sameOrg =
      prof.organization_id && shop.organization_id && prof.organization_id === shop.organization_id;

    if (!sameShop && !sameOrg) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const customerId = shop.stripe_customer_id?.trim() ?? null;
    if (!customerId || !customerId.startsWith("cus_")) {
      return NextResponse.json({ error: "No Stripe customer found for this location" }, { status: 409 });
    }

    const base = getBaseUrl();

    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${base}/dashboard/owner/settings`,
    });

    return NextResponse.json({ url: portal.url }, { status: 200 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}