import { NextResponse } from "next/server";
import { createStripeClient } from "@/features/stripe/lib/stripe/client";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { getActiveInvoiceVersion } from "@/features/invoices/server/financialLifecycle";
import { createConnectedAccountInvoiceCheckout } from "@/features/stripe/lib/server/connected-account-checkout";

const stripe = createStripeClient(process.env.STRIPE_SECRET_KEY ?? "");
const ADMIN_ROLES = new Set(["owner", "admin", "manager", "advisor"]);

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
    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }
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
    if (!workOrder) {
      return NextResponse.json({ error: "Work order not found" }, { status: 404 });
    }

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

    const base = getBaseUrl();
    const successPath =
      typeof body?.successPath === "string" && body.successPath.startsWith("/")
        ? body.successPath
        : `/work-orders/${workOrderId}?payment_session={CHECKOUT_SESSION_ID}`;
    const cancelPath =
      typeof body?.cancelPath === "string" && body.cancelPath.startsWith("/")
        ? body.cancelPath
        : `/work-orders/${workOrderId}`;

    const session = await createConnectedAccountInvoiceCheckout({
      stripe,
      supabase,
      shopId: profile.shop_id,
      workOrderId,
      invoiceVersionId: invoiceVersion.id,
      invoiceVersionNumber: invoiceVersion.version_number,
      outstandingAmount: Number(invoiceVersion.outstanding_total),
      currency: invoiceVersion.currency,
      customerEmail: body?.customerEmail ?? null,
      createdBy: user.id,
      purpose: "staff_invoice_payment",
      successUrl: `${base}${successPath}`,
      cancelUrl: `${base}${cancelPath}`,
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: statusForError(message) });
  }
}
