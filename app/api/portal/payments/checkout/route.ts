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
  workOrderId?: string;
};

type ShopStripeRow = {
  id: string;
  stripe_account_id: string | null;
  stripe_charges_enabled: boolean | null;
  stripe_payouts_enabled: boolean | null;
  labor_rate: number | null;
  country: string | null;
};

type InvoiceRowLite = {
  id: string;
  currency: string | null;
  total: number | null;
  created_at: string | null;
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

function currencyFromCountry(country: unknown): "usd" | "cad" {
  const c = String(country ?? "").trim().toUpperCase();
  return c === "CA" ? "cad" : "usd";
}

function safeCentsFromAmount(amount: unknown): number | null {
  if (amount == null) return null;
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  // amount is dollars -> cents
  return Math.round(n * 100);
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

    // Auth
    const { id: userId } = await requireAuthedUser(supabase);
    const customer = await requirePortalCustomer(supabase, userId);

    // Read email safely (requireAuthedUser may only return id)
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const email = user?.email ?? null;

    const body = (await req.json().catch(() => null)) as Payload | null;
    const workOrderId = body?.workOrderId?.trim();
    if (!workOrderId) {
      return NextResponse.json({ error: "Missing workOrderId" }, { status: 400 });
    }

    // Ownership check (throws/redirects in other contexts; here we just ensure it exists)
    const wo = await requireWorkOrderOwnedByCustomer(supabase, workOrderId, customer.id);

    // Load shop Stripe fields (+ labor rate and country for currency fallback)
    const { data: shop, error: shopErr } = await supabase
      .from("shops")
      .select(
        "id, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, labor_rate, country",
      )
      .eq("id", wo.shop_id)
      .maybeSingle<ShopStripeRow>();

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

    // Get latest invoice total if present
    const { data: inv } = await supabase
      .from("invoices")
      .select("id, currency, total, created_at")
      .eq("work_order_id", workOrderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<InvoiceRowLite>();

    const centsFromInvoice = safeCentsFromAmount(inv?.total);
    const centsFromWO = safeCentsFromAmount(
      
      (wo as unknown as { invoice_total?: number | null }).invoice_total ??
        null,
    );

    // Last fallback: labor_total + parts_total if present
    const laborTotal =
      safeCentsFromAmount(
        
        (wo as unknown as { labor_total?: number | null }).labor_total ?? null,
      ) ?? 0;
    const partsTotal =
      safeCentsFromAmount(
        
        (wo as unknown as { parts_total?: number | null }).parts_total ?? null,
      ) ?? 0;

    const cents =
      centsFromInvoice ??
      centsFromWO ??
      (laborTotal + partsTotal > 0 ? laborTotal + partsTotal : null);

    if (!cents || cents < 50) {
      return NextResponse.json(
        { error: "Invoice total is missing or invalid" },
        { status: 400 },
      );
    }

    const currency =
      inv?.currency != null
        ? clampCurrency(inv.currency)
        : currencyFromCountry(shop.country);

    const base = getBaseUrl();

    const successUrl = `${base}/portal/invoices/${workOrderId}?paid=1&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${base}/portal/invoices/${workOrderId}`;

    const applicationFee = Math.floor((cents * PLATFORM_FEE_BPS) / 10_000);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email ?? undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: cents,
            product_data: {
              name: `Invoice payment (${workOrderId.slice(0, 8)}…)`,
            },
          },
        },
      ],
      payment_intent_data: {
        application_fee_amount: applicationFee,
        transfer_data: { destination: acct },
        metadata: {
          shop_id: shop.id,
          work_order_id: workOrderId,
          customer_id: customer.id,
          created_by: userId,
          purpose: "portal_invoice_payment",
          platform_fee_bps: String(PLATFORM_FEE_BPS),
        },
      },
      metadata: {
        shop_id: shop.id,
        work_order_id: workOrderId,
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