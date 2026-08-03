import { NextResponse } from "next/server";
import { createStripeClient } from "@/features/stripe/lib/stripe/client";
import { createConnectedAccountInvoiceCheckout } from "@/features/stripe/lib/server/connected-account-checkout";
import { getActiveInvoiceVersion } from "@/features/invoices/server/financialLifecycle";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";
import {
  resolveFleetActorContext,
  resolveFleetActorScope,
} from "@/features/fleet/lib/resolveFleetActorContext";

const stripe = createStripeClient(process.env.STRIPE_SECRET_KEY ?? "");

function baseUrl() {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (site) return site.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

function statusFor(message: string) {
  return /not connected|not complete|disabled|upgraded|no payable|not payable/i.test(
    message,
  )
    ? 409
    : 500;
}

export async function POST(request: Request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Stripe is not configured" }, { status: 500 });
    }

    const supabase = createServerSupabaseRoute();
    const actor = await resolveFleetActorContext(supabase);
    const scope = resolveFleetActorScope(actor);
    if (!actor.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (
      !scope?.shopId ||
      (!actor.isInternal && actor.actorType !== "fleet_manager")
    ) {
      return NextResponse.json({ error: "Fleet billing access required" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      workOrderId?: string;
      routePrefix?: string;
    };
    const workOrderId = body.workOrderId?.trim();
    if (!workOrderId) {
      return NextResponse.json({ error: "workOrderId is required" }, { status: 400 });
    }

    const admin = createAdminSupabase();
    let enrollmentQuery = admin
      .from("fleet_vehicles")
      .select("vehicle_id")
      .eq("shop_id", scope.shopId)
      .or("active.is.null,active.eq.true");
    if (scope.fleetIds?.length) enrollmentQuery = enrollmentQuery.in("fleet_id", scope.fleetIds);
    const { data: enrollments, error: enrollmentError } = await enrollmentQuery;
    if (enrollmentError) throw new Error(enrollmentError.message);
    const vehicleIds = (enrollments ?? []).map((row) => row.vehicle_id);
    if (!vehicleIds.length) {
      return NextResponse.json({ error: "Fleet work order not found" }, { status: 404 });
    }

    const { data: workOrder, error: workOrderError } = await admin
      .from("work_orders")
      .select("id,shop_id,vehicle_id")
      .eq("id", workOrderId)
      .eq("shop_id", scope.shopId)
      .in("vehicle_id", vehicleIds)
      .maybeSingle();
    if (workOrderError) throw new Error(workOrderError.message);
    if (!workOrder) {
      return NextResponse.json({ error: "Fleet work order not found" }, { status: 404 });
    }

    const invoice = await getActiveInvoiceVersion({
      supabase: admin,
      workOrderId,
      shopId: scope.shopId,
    });
    if (!invoice || !["issued", "partially_paid"].includes(invoice.lifecycle_status)) {
      return NextResponse.json({ error: "This invoice is not payable" }, { status: 409 });
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const routePrefix =
      body.routePrefix === "/fleet" ? "/fleet" : "/portal/fleet";
    const returnPath = `${routePrefix}/billing?workOrderId=${encodeURIComponent(workOrderId)}`;
    const session = await createConnectedAccountInvoiceCheckout({
      stripe,
      supabase: admin,
      shopId: scope.shopId,
      workOrderId,
      invoiceVersionId: invoice.id,
      invoiceVersionNumber: invoice.version_number,
      outstandingAmount: Number(invoice.outstanding_total),
      currency: invoice.currency,
      customerEmail: user?.email ?? null,
      customerId: null,
      createdBy: actor.userId,
      purpose: actor.isInternal
        ? "staff_invoice_payment"
        : "portal_invoice_payment",
      successUrl: `${baseUrl()}${returnPath}&payment_session={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${baseUrl()}${returnPath}`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start payment";
    return NextResponse.json({ error: message }, { status: statusFor(message) });
  }
}
