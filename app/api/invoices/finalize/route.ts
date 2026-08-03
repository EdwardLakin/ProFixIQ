import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { reviewWorkOrder } from "../../work-orders/[id]/_lib/reviewWorkOrder";
import { getIssuableInvoiceSnapshot } from "@/features/invoices/server/getIssuableInvoiceSnapshot";
import { finalizeInvoiceVersion } from "@/features/invoices/server/financialLifecycle";
import { logOperationalEvent } from "@/features/work-orders/server/logOperationalEvent";

type DB = Database;

const admin = createClient<DB>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type Body = { workOrderId?: string };

export async function POST(req: Request) {
  try {
    const access = await requireShopScopedApiAccess({
      requiredCapabilities: ["canManageWorkOrders", "canAuthorizeQuotes"],
      allowRoles: ["owner", "admin", "manager", "advisor", "service"],
    });
    if (!access.ok) return access.response;

    const body = (await req.json().catch(() => null)) as Body | null;
    const workOrderId = body?.workOrderId?.trim() ?? "";
    if (!workOrderId) return NextResponse.json({ error: "Missing work order ID" }, { status: 400 });

    const { data: workOrder, error: workOrderError } = await admin
      .from("work_orders")
      .select("id,shop_id,customer_id,status")
      .eq("id", workOrderId)
      .eq("shop_id", access.profile.shop_id)
      .maybeSingle<{ id: string; shop_id: string; customer_id: string | null; status: string | null }>();
    if (workOrderError) throw new Error(workOrderError.message);
    if (!workOrder) return NextResponse.json({ error: "Invalid work order" }, { status: 404 });

    const review = await reviewWorkOrder({
      supabase: admin,
      workOrderId,
      shopId: workOrder.shop_id,
      kind: "invoice_review",
    });
    if (!review.ok) return NextResponse.json({ error: "Invoice review failed.", issues: review.issues }, { status: 400 });

    const snapshot = await getIssuableInvoiceSnapshot({
      supabase: admin,
      workOrderId,
      shopId: workOrder.shop_id,
    });
    const total = Number(snapshot.total ?? 0);
    if (!Number.isFinite(total) || total <= 0) {
      return NextResponse.json({ error: "Cannot finalize a zero-total invoice." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { data: existing } = await admin
      .from("invoices")
      .select("id,status")
      .eq("work_order_id", workOrderId)
      .eq("shop_id", workOrder.shop_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; status: string | null }>();

    const invoicePayload = {
      shop_id: workOrder.shop_id,
      work_order_id: workOrderId,
      customer_id: workOrder.customer_id,
      currency: snapshot.currency,
      subtotal: snapshot.subtotal ?? 0,
      labor_cost: snapshot.laborCost ?? 0,
      parts_cost: snapshot.partsCost ?? 0,
      discount_total: snapshot.discountTotal ?? 0,
      tax_total: snapshot.taxTotal ?? 0,
      total,
      status: "issued",
      issued_at: now,
    } as DB["public"]["Tables"]["invoices"]["Insert"];

    let invoiceId = existing?.id ?? null;
    if (invoiceId) {
      const { error } = await admin.from("invoices").update(invoicePayload).eq("id", invoiceId).eq("shop_id", workOrder.shop_id);
      if (error) throw new Error(error.message);
    } else {
      const { data, error } = await admin.from("invoices").insert(invoicePayload).select("id").single<{ id: string }>();
      if (error || !data?.id) throw new Error(error?.message ?? "Failed to create invoice");
      invoiceId = data.id;
    }

    const version = await finalizeInvoiceVersion({
      supabase: admin,
      shopId: workOrder.shop_id,
      workOrderId,
      invoiceId,
      snapshot,
      actorUserId: access.profile.id,
      operationKey: req.headers.get("idempotency-key")?.trim() || `invoice-finalize:${workOrderId}`,
    });

    await admin
      .from("work_orders")
      .update({ status: "invoiced", invoice_total: version.total } as DB["public"]["Tables"]["work_orders"]["Update"])
      .eq("id", workOrderId)
      .eq("shop_id", workOrder.shop_id);

    await logOperationalEvent({
      supabase: admin,
      event: "invoice_finalized",
      entityType: "invoice_version",
      entityId: version.id,
      details: { work_order_id: workOrderId, invoice_id: invoiceId, invoice_total: version.total },
    });

    return NextResponse.json({ ok: true, invoiceId, invoiceVersionId: version.id, total: version.total });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to finalize invoice";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
