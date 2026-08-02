import { NextResponse } from "next/server";
import { createStripeClient } from "@/features/stripe/lib/stripe/client";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import {
  PortalAccessError,
  requireWorkOrderOwnedByCustomer,
} from "@/features/portal/server/portalAuth";
import { requirePortalCustomerActor } from "@/features/portal/server/requirePortalActor";
import { getActiveInvoiceVersion } from "@/features/invoices/server/financialLifecycle";
import { createConnectedAccountInvoiceCheckout } from "@/features/stripe/lib/server/connected-account-checkout";

const stripe = createStripeClient(process.env.STRIPE_SECRET_KEY ?? "");

type Payload = { workOrderId?: string };

function getBaseUrl(): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (site) return site.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

function statusForError(message: string): number {
  if (
    message.includes("not connected") ||
    message.includes("not complete") ||
    message.includes("disabled") ||
    message.includes("upgraded") ||
    message.includes("no payable")
  ) {
    return 409;
  }
  return 500;
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

    const invoiceVersion = await getActiveInvoiceVersion({
      supabase,
      workOrderId,
      shopId: workOrder.shop_id,
    });
    if (!invoiceVersion) {
      return NextResponse.json(
        { error: "No finalized invoice is available for payment" },
        { status: 409 },
      );
    }
    if (!["issued", "partially_paid"].includes(invoiceVersion.lifecycle_status)) {
      return NextResponse.json({ error: "This invoice is not payable" }, { status: 409 });
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const base = getBaseUrl();
    const session = await createConnectedAccountInvoiceCheckout({
      stripe,
      supabase,
      shopId: workOrder.shop_id,
      workOrderId,
      invoiceVersionId: invoiceVersion.id,
      invoiceVersionNumber: invoiceVersion.version_number,
      outstandingAmount: Number(invoiceVersion.outstanding_total),
      currency: invoiceVersion.currency,
      customerEmail: user?.email ?? null,
      customerId: actor.customer.id,
      createdBy: actor.userId,
      purpose: "portal_invoice_payment",
      successUrl: `${base}/portal/invoices/${workOrderId}?payment_session={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}/portal/invoices/${workOrderId}`,
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof PortalAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: statusForError(message) });
  }
}
