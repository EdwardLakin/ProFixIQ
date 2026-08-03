import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { getActiveInvoiceVersion, postPaymentEvent } from "@/features/invoices/server/financialLifecycle";

type DB = Database;

const admin = createClient<DB>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type Body = { workOrderId?: string; amount?: number; note?: string };

export async function POST(req: Request) {
  try {
    const access = await requireShopScopedApiAccess({
      requiredCapabilities: ["canManageWorkOrders"],
      allowRoles: ["owner", "admin", "manager", "advisor", "service"],
    });
    if (!access.ok) return access.response;

    const body = (await req.json().catch(() => null)) as Body | null;
    const workOrderId = body?.workOrderId?.trim() ?? "";
    if (!workOrderId) return NextResponse.json({ error: "Missing work order ID" }, { status: 400 });

    const version = await getActiveInvoiceVersion({
      supabase: admin,
      workOrderId,
      shopId: access.profile.shop_id,
    });
    if (!version) {
      return NextResponse.json({ error: "Finalize the invoice before marking it paid." }, { status: 409 });
    }

    const amount = Number.isFinite(body?.amount)
      ? Math.max(0, Number(body?.amount))
      : Number(version.outstanding_total ?? version.total ?? 0);
    if (amount <= 0) return NextResponse.json({ error: "Invoice has no outstanding balance." }, { status: 400 });

    const result = await postPaymentEvent({
      supabase: admin,
      shopId: version.shop_id,
      workOrderId,
      invoiceVersionId: version.id,
      eventKind: "manual_payment",
      amount,
      currency: version.currency,
      paymentMethod: "manual",
      processor: "manual",
      operationKey: req.headers.get("idempotency-key")?.trim() || `manual-payment:${version.id}:${Date.now()}`,
      actorUserId: access.profile.id,
      metadata: { note: body?.note?.trim() || null },
    });

    const nextStatus = result.invoice_version.lifecycle_status === "paid" ? "paid" : "partially_paid";
    if (version.invoice_id) {
      await admin
        .from("invoices")
        .update({ status: nextStatus } as DB["public"]["Tables"]["invoices"]["Update"])
        .eq("id", version.invoice_id)
        .eq("shop_id", version.shop_id);
    }

    return NextResponse.json({
      ok: true,
      invoiceVersionId: version.id,
      status: result.invoice_version.lifecycle_status,
      outstandingTotal: result.invoice_version.outstanding_total,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to mark invoice paid";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
