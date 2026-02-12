// app/api/portal/payments/checkout/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { cookies as nextCookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import {
  requireAuthedUser,
  requirePortalCustomer,
  requireWorkOrderOwnedByCustomer,
} from "@/features/portal/server/portalAuth";

type DB = Database;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2024-04-10" as Stripe.LatestApiVersion,
});

// 3% platform fee
const PLATFORM_FEE_BPS = 300;

type Payload = {
  shopId?: string;
  workOrderId?: string;
  amountCents?: number;
  currency?: string; // "usd" | "cad"
};

function getBaseUrl(): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (site) return site.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

function clampCurrency(v: unknown): "usd" | "cad" {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "cad" ? "cad" : "usd";
}

function isId(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export async function POST(req: Request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "Missing STRIPE_SECRET_KEY" },
        { status: 500 },
      );
    }

    const supabase = createRouteHandlerClient<DB>({ cookies: nextCookies });

    // ✅ Your helper only returns {id}
    const { id: userId } = await requireAuthedUser(supabase);
    const customer = await requirePortalCustomer(supabase, userId);

    // ✅ Fetch email from supabase auth user (safe + typed)
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const email = (user.email ?? null) as string | null;

    const body = (await req.json().catch(() => null)) as Payload | null;

    if (!isId(body?.shopId)) {
      return NextResponse.json({ error: "Missing shopId" }, { status: 400 });
    }
    if (!isId(body?.workOrderId)) {
      return NextResponse.json({ error: "Missing workOrderId" }, { status: 400 });
    }

    const amountCents =
      typeof body?.amountCents === "number" ? Math.trunc(body.amountCents) : NaN;

    if (!Number.isFinite(amountCents) || amountCents < 50) {
      return NextResponse.json(
        { error: "Invalid amountCents" },
        { status: 400 },
      );
    }

    // Ownership enforcement (customer must own this WO)
    await requireWorkOrderOwnedByCustomer(
      supabase,
      body.workOrderId,
      customer.id,
    );

    // Shop connect status
    const { data: shop, error: shopErr } = await supabase
      .from("shops")
      .select(
        "id, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled",
      )
      .eq("id", body.shopId)
      .maybeSingle<{
        id: string;
        stripe_account_id: string | null;
        stripe_charges_enabled: boolean | null;
        stripe_payouts_enabled: boolean | null;
      }>();

    if (shopErr) {
      return NextResponse.json({ error: shopErr.message }, { status: 500 });
    }
    if (!shop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    const acct = shop.stripe_account_id?.trim() ?? null;
    if (!acct || !acct.startsWith("acct_")) {
      return NextResponse.json(
        { error: "Shop is not connected to Stripe yet" },
        { status: 409 },
      );
    }

    if (!shop.stripe_charges_enabled || !shop.stripe_payouts_enabled) {
      return NextResponse.json(
        { error: "Stripe onboarding not complete for this shop" },
        { status: 409 },
      );
    }

    const currency = clampCurrency(body.currency);
    const base = getBaseUrl();

    // Return customer to the invoice page either way
    const successUrl = `${base}/portal/invoices/${encodeURIComponent(
      body.workOrderId,
    )}?paid=1&session_id={CHECKOUT_SESSION_ID}`;

    const cancelUrl = `${base}/portal/invoices/${encodeURIComponent(
      body.workOrderId,
    )}?canceled=1`;

    const applicationFee = Math.floor((amountCents * PLATFORM_FEE_BPS) / 10_000);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email ?? undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: amountCents,
            product_data: { name: "Invoice payment" },
          },
        },
      ],
      payment_intent_data: {
        application_fee_amount: applicationFee,
        transfer_data: { destination: acct },
        metadata: {
          shop_id: body.shopId,
          work_order_id: body.workOrderId,
          customer_id: customer.id,
          created_by: userId,
          purpose: "portal_invoice_payment",
          platform_fee_bps: String(PLATFORM_FEE_BPS),
        },
      },
      metadata: {
        shop_id: body.shopId,
        work_order_id: body.workOrderId,
        customer_id: customer.id,
        created_by: userId,
        purpose: "portal_invoice_payment",
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}