import { NextResponse } from "next/server";
import { createStripeClient } from "@/features/stripe/lib/stripe/client";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { getActiveInvoiceVersion } from "@/features/invoices/server/financialLifecycle";

const stripe = createStripeClient(process.env.STRIPE_SECRET_KEY ?? "");
const ADMIN_ROLES = new Set(["owner", "admin", "manager", "advisor"]);
const PLATFORM_FEE_BPS = 300;

type Payload = {
  workOrderId?: string;
  customerEmail?: string | null;
  successPath?: string;
  cancelPath?: string;
};

type ProfileScope = { role: string | null; shop_id: string | null };

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
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as Payload | null;
    const workOrderId = body?.workOrderId?.trim() ?? "";
    if (!workOrderId) {
      return NextResponse.json({ error: "Missing workOrderId" }, { status: 400 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role,shop_id")
      .eq("id", user.id)
      .maybeSingle<ProfileScope>();
    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
    if (!profile?.shop_id || !ADMIN_ROLES.has(String(profile.role ?? "").toLowerCase())) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: workOrder, error: workOrderError } = await supabase
      .from("work_orders")
      .select("id,shop_id")
      .eq("id", workOrderId)
      .eq("shop_id", profile.shop_id)
      .maybeSingle<{ id: string; shop_id: string }>();
    if (workOrderError) {
      return NextResponse.json({ error: workOrderError.message }, { status: 500 });
    }
    if (!workOrder) return NextResponse.json({ error: "Work order not found" }, { status: 404 });

    const invoiceVersion = await getActiveInvoiceVersion({
      supabase,
      workOrderId,
      shopId: profile.shop_id,
    });
    if (!invoiceVersion) {
      return NextResponse.json({ error: "No finalized invoice is available" }, { status: 409 });
    }
    if (!["issued", "partially_paid"].includes(invoiceVersion.lifecycle_status)) {
      return NextResponse.json({ error: "This invoice is not payable" }, { status: 409 });
    }

    const amountCents = Math.round(Number(invoiceVersion.outstanding_total) * 100);
    if (!Number.isFinite(amountCents) || amountCents < 50) {
      return NextResponse.json({ error: "This invoice has no outstanding balance" }, { status: 409 });
    }

    const { data: shop, error: shopError } = await supabase
      .from("shops")
      .select("stripe_account_id,stripe_charges_enabled,stripe_payouts_enabled")
      .eq("id", profile.shop_id)
      .maybeSingle<{
        stripe_account_id: string | null;
        stripe_charges_enabled: boolean | null;
        stripe_payouts_enabled: boolean | null;
      }>();
    if (shopError) return NextResponse.json({ error: shopError.message }, { status: 500 });

    const accountId = shop?.stripe_account_id?.trim() ?? "";
    if (!accountId.startsWith("acct_")) {
      return NextResponse.json({ error: "Shop is not connected to Stripe yet" }, { status: 409 });
    }
    if (!shop?.stripe_charges_enabled || !shop.payouts_enabled) {
      return NextResponse.json({ error: "Stripe onboarding not complete for this shop" }, { status: 409 });
    }

    const base = getBaseUrl();
    const successPath =
      typeof body?.successPath === "string" && body.successPath.startsWith("/")
        ? body.successPath
        : `/work-orders/${workOrderId}?payment_session={CHECKOUT_SESSION_ID}`;
    const cancelPath =
      typeof body?.cancelPath === "string" && body.cancelPath.startsWith("/")
        ? body.cancelPath
        : `/work-orders/${workOrderId}`;
    const currency = invoiceVersion.currency.toLowerCase() as "cad" | "usd";
    const applicationFee = Math.floor((amountCents * PLATFORM_FEE_BPS) / 10_000);
    const operationKey = `staff-checkout:${invoiceVersion.id}:${invoiceVersion.outstanding_total}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: body?.customerEmail ?? undefined,
      client_reference_id: invoiceVersion.id,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: amountCents,
            product_data: { name: `Invoice payment — work order ${workOrderId.slice(0, 8)}` },
          },
        },
      ],
      payment_intent_data: {
        application_fee_amount: applicationFee,
        transfer_data: { destination: accountId },
        metadata: {
          shop_id: profile.shop_id,
          work_order_id: workOrderId,
          invoice_version_id: invoiceVersion.id,
          operation_key: operationKey,
          created_by: user.id,
          purpose: "staff_invoice_payment",
          platform_fee_bps: String(PLATFORM_FEE_BPS),
        },
      },
      metadata: {
        shop_id: profile.shop_id,
        work_order_id: workOrderId,
        invoice_version_id: invoiceVersion.id,
        operation_key: operationKey,
        created_by: user.id,
        purpose: "staff_invoice_payment",
      },
      success_url: `${base}${successPath}`,
      cancel_url: `${base}${cancelPath}`,
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
