// app/api/payments/checkout/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { STRIPE_PLATFORM_FEE_BPS } from "@/features/stripe/lib/stripe/constants";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-04-10" as Stripe.LatestApiVersion,
});

function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL)
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL)
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

type CustomerPaymentPayload = {
  shopId: string;
  stripeAccountId: string; // connected account (destination)
  amountCents: number; // total customer amount in cents
  currency?: "usd" | "cad";
  workOrderId?: string | null;
  workOrderLineId?: string | null;
  customerId?: string | null;
  description?: string | null;
};

function clampCurrency(v: unknown): "usd" | "cad" {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "cad" ? "cad" : "usd";
}

/**
 * Customer payment checkout:
 * - Customer pays
 * - Funds go to shop’s connected account
 * - Platform takes 3% application fee
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CustomerPaymentPayload;

    const shopId = String(body.shopId ?? "").trim();
    const stripeAccountId = String(body.stripeAccountId ?? "").trim();
    const amountCents =
      typeof body.amountCents === "number" ? Math.trunc(body.amountCents) : 0;

    if (!shopId) {
      return NextResponse.json({ error: "Missing shopId" }, { status: 400 });
    }
    if (!stripeAccountId || !stripeAccountId.startsWith("acct_")) {
      return NextResponse.json(
        { error: "Invalid stripeAccountId" },
        { status: 400 },
      );
    }
    if (!Number.isFinite(amountCents) || amountCents < 50) {
      return NextResponse.json(
        { error: "Invalid amountCents" },
        { status: 400 },
      );
    }

    const currency = clampCurrency(body.currency);

    const applicationFeeAmount = Math.floor(
      (amountCents * STRIPE_PLATFORM_FEE_BPS) / 10_000,
    );

    const base = getBaseUrl();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency,
            unit_amount: amountCents,
            product_data: {
              name: "Repair order payment",
              description: body.description ?? undefined,
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${base}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/pay/cancel`,
      payment_intent_data: {
        application_fee_amount: applicationFeeAmount,
        transfer_data: { destination: stripeAccountId },
        metadata: {
          shop_id: shopId,
          work_order_id: body.workOrderId ?? "",
          work_order_line_id: body.workOrderLineId ?? "",
          customer_id: body.customerId ?? "",
          purpose: "customer_payment",
          platform_fee_bps: String(STRIPE_PLATFORM_FEE_BPS),
        },
      },
      metadata: {
        shop_id: shopId,
        work_order_id: body.workOrderId ?? "",
        work_order_line_id: body.workOrderLineId ?? "",
        customer_id: body.customerId ?? "",
        purpose: "customer_payment",
      },
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[payments checkout]", message);
    return NextResponse.json(
      { error: "Checkout failed", details: message },
      { status: 500 },
    );
  }
}