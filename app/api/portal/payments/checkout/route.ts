import { NextResponse } from "next/server";
import { createStripeClient } from "@/features/stripe/lib/stripe/client";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { PortalAccessError, requireWorkOrderOwnedByCustomer } from "@/features/portal/server/portalAuth";
import { requirePortalCustomerActor } from "@/features/portal/server/requirePortalActor";
import { getActiveInvoiceVersion } from "@/features/invoices/server/financialLifecycle";

const stripe = createStripeClient(process.env.STRIPE_SECRET_KEY ?? "");
const PLATFORM_FEE_BPS = 300;

type Payload = { workOrderId?: string };
type ShopStripeRow = {
  id: string;
  stripe_account_id: string | null;
  stripe_charges_enabled: boolean | null;
  stripe_payouts_enabled: boolean | null;
};

function getBaseUrl(): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (site) return site.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

export async function POST(req: Request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });
    }

    const supabase = createServerSupabaseRoute();
    const actor = await requirePortalCustomerActor(supabase);
    const body = (await req.json().catch(() => null)) as Payload | null;
    const workOrderId = body?.workOrderId?.trim();
    if (!workOrderId) {
      return NextResponse.json({ error: "Missing workOrderId" }, { status: 400 });
    }

    const workOrder = await requireWorkOrderOwnedByCustomer(
      supabase,
      workOrderId,
      actor.customer.id,
    );

    const { data: shop, error: shopError } = await supabase
      .from("shops")
      .select("id, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled")
      .eq("id", workOrder.shop_id)
      .maybeSingle<ShopStripeRow>();

    if (shopError) return NextResponse.json({ error: shopError.message }, { status: 500 });
    if (!shop) return NextResponse.json({ error: "Shop not found" }, { status: 404 });

    const accountId = shop.stripe_account_id?.trim() ?? "";
    if (!accountId.startsWith("acct_")) {
      return NextResponse.json({ error: "Shop is not connected to Stripe yet" }, { status: 409 });
    }
    if (!shop.stripe_charges_enabled || !shop.stripe_payouts_enabled) {
      return NextResponse.json({ error: "Stripe onboarding not complete for this shop" }, { status: 409 });
    }

    const invoiceVersion = await getActiveInvoiceVersion({
      supabase,
      workOrderId,
      shopId: shop.id,
    });

    if (!invoiceVersion) {
      return NextResponse.json({ error: "No finalized invoice is available for payment" }, { status: 409 });
    }
    if (!["issued", "partially_paid"].includes(invoiceVersion.lifecycle_status)) {
      return NextResponse.json({ error: "This invoice is not payable" }, { status: 409 });
    }

    const amountCents = Math.round(Number(invoiceVersion.outstanding_total) * 100);
    if (!Number.isFinite(amountCents) || amountCents < 50) {
      return NextResponse.json({ error: "This invoice has no outstanding balance" }, { status: 409 });
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const currency = invoiceVersion.currency.toLowerCase() as "cad" | "usd";
    const base = getBaseUrl();
    const applicationFee = Math.floor((amountCents * PLATFORM_FEE_BPS) / 10_000);
    const operationKey = `portal-checkout:${invoiceVersion.id}:${invoiceVersion.outstanding_total}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: user?.email ?? undefined,
      client_reference_id: invoiceVersion.id,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: amountCents,
            product_data: {
              name: `Invoice ${invoiceVersion.version_number} payment`,
              description: `Work order ${workOrderId.slice(0, 8)}`,
            },
          },
        },
      ],
      payment_intent_data: {
        application_fee_amount: applicationFee,
        transfer_data: { destination: accountId },
        metadata: {
          shop_id: shop.id,
          work_order_id: workOrderId,
          customer_id: actor.customer.id,
          invoice_version_id: invoiceVersion.id,
          operation_key: operationKey,
          created_by: actor.userId,
          purpose: "portal_invoice_payment",
          platform_fee_bps: String(PLATFORM_FEE_BPS),
        },
      },
      metadata: {
        shop_id: shop.id,
        work_order_id: workOrderId,
        customer_id: actor.customer.id,
        invoice_version_id: invoiceVersion.id,
        operation_key: operationKey,
        created_by: actor.userId,
        purpose: "portal_invoice_payment",
      },
      success_url: `${base}/portal/invoices/${workOrderId}?payment_session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/portal/invoices/${workOrderId}`,
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof PortalAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
