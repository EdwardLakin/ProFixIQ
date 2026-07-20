import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import {
  runPostSendPersistence,
  sendInvoiceReadyEmail,
} from "@/features/email/server";
import { getActiveBrandForRender } from "@/features/branding/server/getActiveBrandForRender";
import { getIssuableInvoiceSnapshot } from "@/features/invoices/server/getIssuableInvoiceSnapshot";
import { getInvoiceSnapshotForWorkOrder } from "@/features/invoices/server/getInvoiceSnapshot";
import { finalizeInvoiceVersion } from "@/features/invoices/server/financialLifecycle";
import { reviewWorkOrder } from "../../work-orders/[id]/_lib/reviewWorkOrder";
import { logOperationalEvent } from "@/features/work-orders/server/logOperationalEvent";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type DB = Database;
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type ShopRow = DB["public"]["Tables"]["shops"]["Row"];

const admin = createClient<DB>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://profixiq.com";

type Body = {
  workOrderId?: string;
  customerEmail?: string;
  customerName?: string;
  shopName?: string;
};

function joinedName(first?: string | null, last?: string | null) {
  return (
    [first?.trim(), last?.trim()].filter(Boolean).join(" ").trim() || undefined
  );
}

function resolvedShopName(
  shop: Pick<ShopRow, "business_name" | "shop_name" | "name"> | null,
  override?: string,
) {
  return (
    override?.trim() ||
    shop?.business_name?.trim() ||
    shop?.shop_name?.trim() ||
    shop?.name?.trim() ||
    "ProFixIQ"
  );
}

function invoicePartSignature(
  parts: Array<{ id: string; qty: number; unitPrice: number }>,
): string {
  return parts
    .map((part) => ({
      id: part.id,
      qty: Number(part.qty),
      unitPrice: Number(part.unitPrice),
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((part) => `${part.id}:${part.qty}:${part.unitPrice}`)
    .join("|");
}

export async function POST(req: Request) {
  try {
    const access = await requireShopScopedApiAccess({
      requiredCapabilities: ["canManageWorkOrders", "canAuthorizeQuotes"],
      allowRoles: ["owner", "admin", "manager", "advisor", "service"],
    });
    if (!access.ok) return access.response;

    const body = (await req.json().catch(() => null)) as Body | null;
    const workOrderId = body?.workOrderId?.trim() ?? "";
    if (!workOrderId) {
      return NextResponse.json(
        { error: "Missing work order ID" },
        { status: 400 },
      );
    }

    const { data: workOrder } = await admin
      .from("work_orders")
      .select("id,shop_id,customer_id,customer_name,status")
      .eq("id", workOrderId)
      .eq("shop_id", access.profile.shop_id)
      .maybeSingle<
        Pick<
          WorkOrderRow,
          "id" | "shop_id" | "customer_id" | "customer_name" | "status"
        >
      >();
    if (!workOrder)
      return NextResponse.json(
        { error: "Invalid work order" },
        { status: 404 },
      );

    const status = String(workOrder.status ?? "")
      .trim()
      .toLowerCase()
      .replaceAll(" ", "_");
    if (!["completed", "ready_to_invoice", "invoiced"].includes(status)) {
      return NextResponse.json(
        {
          error: `Work order status ${workOrder.status ?? "unknown"} is not ready for invoicing`,
        },
        { status: 409 },
      );
    }

    const review = await reviewWorkOrder({
      supabase: admin,
      workOrderId,
      shopId: workOrder.shop_id,
      kind: "invoice_review",
    });
    if (!review.ok) {
      return NextResponse.json(
        { error: "Invoice review failed.", issues: review.issues },
        { status: 400 },
      );
    }

    const draftSnapshot = await getInvoiceSnapshotForWorkOrder({
      supabase: admin,
      workOrderId,
    });
    const snapshot = await getIssuableInvoiceSnapshot({
      supabase: admin,
      workOrderId,
      shopId: workOrder.shop_id,
    });
    const draftParts = Number(draftSnapshot.partsCost ?? 0);
    const issuableParts = Number(snapshot.partsCost ?? 0);
    const draftTotal = Number(draftSnapshot.total ?? 0);
    const issuableTotal = Number(snapshot.total ?? 0);
    const partsMatch =
      invoicePartSignature(draftSnapshot.parts) ===
      invoicePartSignature(snapshot.parts);
    if (
      !partsMatch ||
      Math.abs(draftParts - issuableParts) > 0.01 ||
      Math.abs(draftTotal - issuableTotal) > 0.01
    ) {
      return NextResponse.json(
        {
          error:
            "Invoice totals changed because one or more attached parts have not been issued to the work order. Complete the parts handoff, then review the invoice again.",
          draftParts,
          issuableParts,
          draftTotal,
          issuableTotal,
        },
        { status: 409 },
      );
    }
    const total = Number(snapshot.total ?? 0);
    if (!Number.isFinite(total) || total <= 0) {
      return NextResponse.json(
        { error: "Cannot issue a zero-total invoice." },
        { status: 400 },
      );
    }

    const [{ data: shop }, { data: customer }] = await Promise.all([
      admin
        .from("shops")
        .select("business_name,shop_name,name")
        .eq("id", workOrder.shop_id)
        .maybeSingle<Pick<ShopRow, "business_name" | "shop_name" | "name">>(),
      workOrder.customer_id
        ? admin
            .from("customers")
            .select("id,user_id,name,first_name,last_name,email")
            .eq("id", workOrder.customer_id)
            .maybeSingle<
              Pick<
                CustomerRow,
                "id" | "user_id" | "name" | "first_name" | "last_name" | "email"
              >
            >()
        : Promise.resolve({ data: null, error: null }),
    ]);

    const email =
      body?.customerEmail?.trim().toLowerCase() ||
      customer?.email?.trim().toLowerCase() ||
      "";
    if (!email) {
      return NextResponse.json(
        { error: "Missing customer email." },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const { data: pending } = await admin
      .from("invoices")
      .select("id")
      .eq("work_order_id", workOrderId)
      .eq("shop_id", workOrder.shop_id)
      .eq("status", "issued_pending_send")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();

    const payload = {
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
      status: "issued_pending_send",
      issued_at: now,
    } as DB["public"]["Tables"]["invoices"]["Insert"];

    let invoiceId = pending?.id ?? null;
    if (invoiceId) {
      const { error } = await admin
        .from("invoices")
        .update(payload)
        .eq("id", invoiceId)
        .eq("shop_id", workOrder.shop_id);
      if (error) throw new Error(error.message);
    } else {
      const { data, error } = await admin
        .from("invoices")
        .insert(payload)
        .select("id")
        .single<{ id: string }>();
      if (error || !data?.id)
        throw new Error(error?.message ?? "Failed to create invoice");
      invoiceId = data.id;
    }
    if (!invoiceId) throw new Error("Invoice persistence did not return an id");

    // Resolve document branding once, at issuance. The complete renderer
    // configuration is stored in the immutable version snapshot so historical
    // invoices never change when the shop updates its logo or template later.
    const brand = await getActiveBrandForRender(workOrder.shop_id);
    const issuedSnapshot = {
      ...snapshot,
      documentConfiguration: brand.document,
    };
    const version = await finalizeInvoiceVersion({
      supabase: admin,
      shopId: workOrder.shop_id,
      workOrderId,
      invoiceId,
      snapshot: issuedSnapshot,
      actorUserId: access.profile.id,
      operationKey:
        req.headers.get("idempotency-key")?.trim() ||
        `invoice-send:${workOrderId}`,
    });

    const base = SITE_URL.trim().replace(/\/+$/, "");
    const portalUrl = `${base}/portal/invoices/${workOrderId}?version=${version.id}`;
    const pdfUrl = `${base}/api/invoice-versions/${version.id}/pdf?download=1`;
    const shopLabel = resolvedShopName(shop, body?.shopName);
    const customerLabel =
      body?.customerName?.trim() ||
      customer?.name?.trim() ||
      joinedName(customer?.first_name, customer?.last_name) ||
      workOrder.customer_name?.trim() ||
      undefined;
    await sendInvoiceReadyEmail({
      shopId: workOrder.shop_id,
      to: email,
      portalUrl,
      workOrderId,
      invoiceTotal: version.total,
      laborTotal: issuedSnapshot.laborCost ?? 0,
      partsTotal: issuedSnapshot.partsCost ?? 0,
      customerName: customerLabel,
      shopName: shopLabel,
      brandLogoUrl: brand?.logoUrl ?? null,
      brandPrimaryColor: brand?.colors.primary ?? null,
      brandSecondaryColor: brand?.colors.secondary ?? null,
    });

    const warnings = await runPostSendPersistence([
      {
        step: "invoice_status_after_send",
        run: async () => {
          const { error } = await admin
            .from("invoices")
            .update({ status: "issued", issued_at: now })
            .eq("id", invoiceId)
            .eq("shop_id", workOrder.shop_id);
          if (error) throw new Error(error.message);
        },
      },
      {
        step: "work_order_invoice_state_update",
        run: async () => {
          const { error } = await admin
            .from("work_orders")
            .update({
              status: "invoiced",
              invoice_sent_at: now,
              invoice_last_sent_to: email,
              invoice_total: version.total,
              invoice_url: portalUrl,
              invoice_pdf_url: pdfUrl,
            } as DB["public"]["Tables"]["work_orders"]["Update"])
            .eq("id", workOrderId)
            .eq("shop_id", workOrder.shop_id);
          if (error) throw new Error(error.message);
        },
      },
      {
        step: "invoice_sent_audit_log",
        run: async () => {
          await logOperationalEvent({
            supabase: admin,
            event: "invoice_sent",
            entityType: "invoice_version",
            entityId: version.id,
            details: {
              work_order_id: workOrderId,
              invoice_id: invoiceId,
              invoice_version_id: version.id,
              invoice_total: version.total,
              recipient: email,
            },
          });
        },
      },
      ...(customer?.user_id
        ? [
            {
              step: "portal_invoice_notification_insert",
              run: async () => {
                const { error } = await admin
                  .from("portal_notifications")
                  .insert({
                    user_id: customer.user_id,
                    customer_id: customer.id,
                    work_order_id: workOrderId,
                    kind: "invoice_ready",
                    title: "Invoice ready",
                    body: `Your invoice for Work Order ${workOrderId} at ${shopLabel} is ready to view.`,
                  });
                if (error) throw new Error(error.message);
              },
            },
          ]
        : []),
    ]);

    return NextResponse.json({
      ok: true,
      invoiceId,
      invoiceVersionId: version.id,
      invoiceVersion: version,
      sentWithWarnings: warnings.length > 0 || undefined,
      warnings: warnings.length ? warnings : undefined,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error sending invoice";
    console.error("[invoices/send] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
