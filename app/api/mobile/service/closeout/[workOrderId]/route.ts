import { NextResponse } from "next/server";

import { getActiveInvoiceVersion } from "@/features/invoices/server/financialLifecycle";
import {
  canFieldOperatorAccessWorkOrder,
  requireMobileServiceOperatorApiAccess,
} from "@/features/mobile/service/server/access";
import { createConnectedAccountInvoiceCheckout } from "@/features/stripe/lib/server/connected-account-checkout";
import { createStripeClient } from "@/features/stripe/lib/stripe/client";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type CheckoutBody = { action?: "checkout" };

async function fieldAccessAllowed(
  access: Extract<
    Awaited<ReturnType<typeof requireMobileServiceOperatorApiAccess>>,
    { ok: true }
  >,
  workOrderId: string,
): Promise<boolean> {
  return canFieldOperatorAccessWorkOrder(access, workOrderId);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ workOrderId: string }> },
) {
  const access = await requireMobileServiceOperatorApiAccess();
  if (!access.ok) return access.response;
  const { workOrderId } = await context.params;
  if (!(await fieldAccessAllowed(access, workOrderId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const admin = createAdminSupabase();

  const { data: workOrder, error: workOrderError } = await admin
    .from("work_orders")
    .select(
      "id,custom_id,status,payment_status,outstanding_balance,customer_id",
    )
    .eq("id", workOrderId)
    .eq("shop_id", access.profile.shop_id)
    .maybeSingle();
  if (workOrderError)
    return NextResponse.json(
      { error: workOrderError.message },
      { status: 500 },
    );
  if (!workOrder)
    return NextResponse.json(
      { error: "Work order not found." },
      { status: 404 },
    );

  const invoiceVersion = await getActiveInvoiceVersion({
    supabase: admin,
    workOrderId,
    shopId: access.profile.shop_id,
  });

  let receipt = null;
  if (invoiceVersion) {
    const receiptResult = await admin
      .from("payment_receipts")
      .select(
        "id,receipt_number,amount,currency,payment_method,received_at,remaining_balance",
      )
      .eq("shop_id", access.profile.shop_id)
      .eq("invoice_version_id", invoiceVersion.id)
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!receiptResult.error) receipt = receiptResult.data;
  }

  return NextResponse.json({
    workOrder,
    invoiceVersion: invoiceVersion
      ? {
          id: invoiceVersion.id,
          invoiceId: invoiceVersion.invoice_id,
          lifecycleStatus: invoiceVersion.lifecycle_status,
          currency: invoiceVersion.currency,
          total: Number(invoiceVersion.total),
          paidTotal: Number(invoiceVersion.paid_total),
          outstandingTotal: Number(invoiceVersion.outstanding_total),
        }
      : null,
    receipt,
    fieldOperator: access.isFieldOperator,
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workOrderId: string }> },
) {
  const access = await requireMobileServiceOperatorApiAccess();
  if (!access.ok) return access.response;
  const { workOrderId } = await context.params;
  if (!(await fieldAccessAllowed(access, workOrderId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as CheckoutBody | null;
  if (body?.action !== "checkout") {
    return NextResponse.json(
      { error: "Unsupported closeout action." },
      { status: 400 },
    );
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Card payments are not configured." },
      { status: 500 },
    );
  }

  const admin = createAdminSupabase();
  const invoiceVersion = await getActiveInvoiceVersion({
    supabase: admin,
    workOrderId,
    shopId: access.profile.shop_id,
  });
  if (!invoiceVersion)
    return NextResponse.json(
      { error: "Finalize the invoice before taking payment." },
      { status: 409 },
    );
  if (!["issued", "partially_paid"].includes(invoiceVersion.lifecycle_status)) {
    return NextResponse.json(
      { error: "This invoice is not currently payable." },
      { status: 409 },
    );
  }
  if (Number(invoiceVersion.outstanding_total) <= 0.005) {
    return NextResponse.json({ ok: true, paid: true });
  }

  const { data: workOrder, error: workOrderError } = await admin
    .from("work_orders")
    .select("id,customer_id")
    .eq("id", workOrderId)
    .eq("shop_id", access.profile.shop_id)
    .maybeSingle();
  if (workOrderError || !workOrder) {
    return NextResponse.json(
      { error: workOrderError?.message ?? "Work order not found." },
      { status: workOrderError ? 500 : 404 },
    );
  }

  let customerEmail: string | null = null;
  if (workOrder.customer_id) {
    const customerResult = await admin
      .from("customers")
      .select("email")
      .eq("id", workOrder.customer_id)
      .eq("shop_id", access.profile.shop_id)
      .maybeSingle();
    customerEmail = customerResult.data?.email?.trim() || null;
  }

  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin
  ).replace(/\/$/, "");
  const stripe = createStripeClient(process.env.STRIPE_SECRET_KEY);

  try {
    const session = await createConnectedAccountInvoiceCheckout({
      stripe,
      supabase: admin,
      shopId: access.profile.shop_id,
      workOrderId,
      invoiceVersionId: invoiceVersion.id,
      invoiceVersionNumber: invoiceVersion.version_number,
      outstandingAmount: Number(invoiceVersion.outstanding_total),
      currency: invoiceVersion.currency,
      customerEmail,
      customerId: workOrder.customer_id,
      createdBy: access.authUserId,
      purpose: "staff_invoice_payment",
      successUrl: `${siteUrl}/mobile/service/closeout/${encodeURIComponent(workOrderId)}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${siteUrl}/mobile/service/closeout/${encodeURIComponent(workOrderId)}?payment=cancelled`,
    });
    return NextResponse.json({
      ok: true,
      url: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to start card payment.",
      },
      { status: 400 },
    );
  }
}
