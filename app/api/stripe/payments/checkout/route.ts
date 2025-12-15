import { NextResponse } from "next/server";
import Stripe from "stripe";
import { cookies as nextCookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2024-04-10" as Stripe.LatestApiVersion,
});

const ADMIN_ROLES = new Set<string>(["owner", "admin", "manager", "advisor"]);

// ✅ 3% platform fee
const PLATFORM_FEE_BPS = 300;

function getBaseUrl(): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (site) return site.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

type Payload = {
  shopId?: string;
  amountCents?: number;
  currency?: string; // default usd
  description?: string;

  // optional context
  workOrderId?: string | null;
  customerEmail?: string | null;

  // optional redirect overrides
  successPath?: string;
  cancelPath?: string;
};

type ProfileScope = {
  role: string | null;
  shop_id: string | null;
};

function clampCurrency(v: unknown): "usd" | "cad" {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "cad" ? "cad" : "usd";
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

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as Payload | null;
    if (!body?.shopId) {
      return NextResponse.json({ error: "Missing shopId" }, { status: 400 });
    }

    const amountCents =
      typeof body.amountCents === "number" ? Math.trunc(body.amountCents) : NaN;

    if (!Number.isFinite(amountCents) || amountCents < 50) {
      return NextResponse.json(
        { error: "Invalid amountCents" },
        { status: 400 },
      );
    }

    const currency = clampCurrency(body.currency);
    const description = String(body.description ?? "Repair order payment").trim();

    // scope + role
    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("role, shop_id")
      .eq("id", user.id)
      .maybeSingle<ProfileScope>();

    if (profErr) {
      return NextResponse.json({ error: profErr.message }, { status: 500 });
    }

    if (!prof?.shop_id || prof.shop_id !== body.shopId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const role = String(prof.role ?? "").toLowerCase();
    if (!ADMIN_ROLES.has(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // shop connect
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

    const base = getBaseUrl();

    const successPath =
      typeof body.successPath === "string" && body.successPath.startsWith("/")
        ? body.successPath
        : "/pay/success?session_id={CHECKOUT_SESSION_ID}";

    const cancelPath =
      typeof body.cancelPath === "string" && body.cancelPath.startsWith("/")
        ? body.cancelPath
        : "/pay/cancel";

    const successUrl = `${base}${successPath}`;
    const cancelUrl = `${base}${cancelPath}`;

    const applicationFee = Math.floor((amountCents * PLATFORM_FEE_BPS) / 10_000);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: body.customerEmail ?? undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: amountCents,
            product_data: {
              name: description,
            },
          },
        },
      ],
      payment_intent_data: {
        application_fee_amount: applicationFee,
        transfer_data: { destination: acct },
        metadata: {
          shop_id: body.shopId,
          work_order_id: body.workOrderId ?? "",
          created_by: user.id,
          purpose: "customer_payment",
          platform_fee_bps: String(PLATFORM_FEE_BPS),
        },
      },
      metadata: {
        shop_id: body.shopId,
        work_order_id: body.workOrderId ?? "",
        created_by: user.id,
        purpose: "customer_payment",
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