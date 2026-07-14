import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { runPostSendPersistence, sendInvoiceReadyEmail } from "@/features/email/server";
import { getActiveBrandForRender } from "@/features/branding/server/getActiveBrandForRender";
import { getInvoiceSnapshotForWorkOrder } from "@/features/invoices/server/getInvoiceSnapshot";
import { finalizeInvoiceVersion } from "@/features/invoices/server/financialLifecycle";
import { reviewWorkOrder } from "../../work-orders/[id]/_lib/reviewWorkOrder";
import { logOperationalEvent } from "@/features/work-orders/server/logOperationalEvent";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type DB = Database;
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type ShopRow = DB["public"]["Tables"]["shops"]["Row"];

const supabaseAdmin = createClient<DB>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://profixiq.com";

type RequestBody = {
  workOrderId?: string;
  customerEmail?: string;
  customerName?: string;
  shopName?: string;
};

type SendInvoiceResponse = {
  ok?: boolean;
  invoiceVersionId?: string;
  error?: string;
  sentWithWarnings?: boolean;
  warnings?: Array<{ step: string; message: string }>;
};

function joinName(first?: string | null, last?: string | null): string | undefined {
  const value = [first?.trim(), last?.trim()].filter(Boolean).join(" ").trim();
  return value || undefined;
}

function pickShopName(
  shop?: Pick<ShopRow, "business_name" | "shop_name" | "name"> | null,
): string | undefined {
  return (
    shop?.business_name?.trim() ||
    shop?.shop_name?.trim() ||
    shop?.name?.trim() ||
    undefined
  );
}

export async function POST(req: Request) {
  try {
    const access = await requireShopScopedApiAccess({
      requiredCapabilities: ["canManageWorkOrders", "canAuthorizeQuotes"],
      allowRoles: ["owner", "admin", "manager", "advisor", "service"],
    });
    if (!access.ok) return access.response;

    const body = (await req.json().catch(() => null)) as RequestBody | null;
    const workOrderId = body?.workOrderId?.trim() ?? "";
    if (!workOrderId) {
      return NextResponse.json({ error: "Missing work order ID" }, { status: 400 });
    }

    const { data: workOrder, error: workOrderError } = await supabaseAdmin
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

    if (workOrderError || !workOrder) {
      return NextResponse.json({ error: "Invalid work order" }, { status: 404 });
    }

    const normalizedStatus = String(workOrder.status ?? "")
      .trim()
      .toLowerCase()
      .replaceAll(" ", "_");
    if (!["completed", "ready_to_invoice", "invoiced"].includes(normalizedStatus)) {
      return NextResponse.json(
        { error: `Work order status ${workOrder.status ?? "unknown"} is not ready for invoicing` },
        { status: 409 },
      );
    }

    const review = await reviewWorkOrder({
      supabase: supabaseAdmin,
      workOrderId,
      shopId: workOrder.shop_id,
      kind: "invoice_review",
    });
    if (!review.ok) {
      return NextResponse.json(
        {
          error: "Invoice review failed. Resolve blocking issues before sending.",
          issues: review.issues,
        },
        { status: 400 },
      );
    }

    const snapshot = await getInvoiceSnapshotForWorkOrder({
      supabase: supabaseAdmin,
      workOrderId,
    });
    const invoiceTotal = Number(snapshot.total ?? 0);
    if (!Number.isFinite(invoiceTotal) || invoiceTotal <= 0) {
      return NextResponse.json(
        { error: "Cannot send invoice with a zero total. Add labor or parts before invoicing." },
        { status: 400 },
      );
    }

    const [{ data: shop }, { data: customer }] = await Promise.all([
      supabaseAdmin
        .from("shops")
        .select("business_name,shop_name,name")
        .eq("id", workOrder.shop_id)
        .maybeSingle<Pick<ShopRow, "business_name" | "shop_name" | "name">>(),
      workOrder.customer_id
        ? supabaseAdmin
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

    const customerEmail =
      body?.customerEmail?.trim().toLowerCase() || customer?.email?.trim().toLowerCase() || "";
    if (!customerEmail) {
      return NextResponse.json(
        { error: "Missing customer email. Add an email to the customer before invoicing." },
        { status: 400 },
      );
    }

    const nowIso = new Date().toISOString();
    const { data: pendingInvoice } = await supabaseAdmin
      .from("invoices")
      .select("id")
      .eq("work_order_id", workOrderId)
      .eq("shop_id", workOrder.shop_id)
      .eq("status", "issued_pending_send")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();

    let invoiceId = pendingInvoice?.id ?? null;
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
      total: invoiceTotal,
      status: "issued_pending_send",
      issued_at: nowIso,
    } satisfies DB["public"]["Tables"]["invoices"]["Insert"];

    if (invoiceId) {
      const { error } = await supabaseAdmin
        .from("invoices")
        .update(invoicePayload)
        .eq("id", invoiceId)
        .eq("shop_id", workOrder.shop_id);
      if (error) throw new Error(`Failed to persist invoice: ${error.message}`);
    } else {
      const { data, error } = await supabaseAdmin
        .from("invoices")
        .insert(invoicePayload)
        .select("id")
        .single<{ id: string }>();
      if (error || !data?.id) {
        throw new Error(`Failed to create invoice: ${error?.message ?? "unknown error"}`);
      }
      invoiceId = data.id;
    }

    const invoiceVersion = await finalizeInvoiceVersion({
      supabase: supabaseAdmin,
      shopId: workOrder.shop_id,
      workOrderId,
      invoiceId,
      snapshot,
      actorUserId: access.user.id,
      operationKey: req.headers.get("idempotency-key")?.trim() || `invoice-send:${workOrderId}`,
    });

    const baseUrl = SITE_URL.trim().replace(/\/+$/, "");
    const portalInvoiceUrl = `${baseUrl}/portal/invoices/${workOrderId}?version=${invoiceVersion.id}`;
    const invoicePdfUrl = `${baseUrl}/api/work-orders/${workOrderId}/invoice-pdf?version=${invoiceVersion.id}&download=1`;
    const shopName = body?.shopName?.trim() || pickShopName(shop) || "ProFixIQ";
    const customerName =
      body?.customerName?.trim() ||
      customer?.name?.trim() ||
      joinName(customer?.first_name, customer?.last_name) ||
      workOrder.customer_name?.trim() ||
      undefined;
    const brand = await getActiveBrandForRender(workOrder.shop_id);

    await sendInvoiceReadyEmail({
      shopId: workOrder.shop_id,
      to: customerEmail,
      portalUrl: portalInvoiceUrl,
      workOrderId,
      invoiceTotal: invoiceVersion.total,
      laborTotal: snapshot.laborCost ?? 0,
      partsTotal: snapshot.partsCost ?? 0,
      customerName,
      shopName,
      brandLogoUrl: brand?.logoUrl ?? null,
      brandPrimaryColor: brand?.colors.primary ?? null,
      brandSecondaryColor: brand?.colors.secondary ?? null,
    });

    const warnings = await runPostSendPersistence([
      {
        step: "invoice_status_after_send",
        run: async () => {
          const { error } = await supabaseAdmin
            .from("invoices")
            .update({ status: "issued", issued_at: nowIso })
            .eq("id", invoiceId)
            .eq("shop_id", workOrder.shop_id);
          if (error) throw new Error(error.message);
        },
      },
      {
        step: "work_order_invoice_state_update",
        run: async () => {
          const { error } = await supabaseAdmin
            .from("work_orders")
            .update({
              status: "invoiced",
              invoice_sent_at: nowIso,
              invoice_last_sent_to: customerEmail,
              invoice_total: invoiceVersion.total,
              invoice_url: portalInvoiceUrl,
              invoice_pdf_url: invoicePdfUrl,
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
            supabase: supabaseAdmin,
            event: "invoice_sent",
            entityType: "invoice_version",
            entityId: invoiceVersion.id,
            details: {
              work_order_id: workOrderId,
              invoice_id: invoiceId,
              invoice_version_id: invoiceVersion.id,
              invoice_total: invoiceVersion.total,
              recipient: customerEmail,
            },
          });
        },
      },
      ...(customer?.user_id
        ? [
            {
              step: "portal_invoice_notification_insert",
              run: async () => {
                const { error } = await supabaseAdmin.from("portal_notifications").insert({
                  user_id: customer.user_id,
                  customer_id: customer.id,
                  work_order_id: workOrderId,
                  kind: "invoice_ready",
                  title: "Invoice ready",
                  body: `Your invoice for Work Order ${workOrderId} at ${shopName} is ready to view.`,
                });
                if (error) throw new Error(error.message);
              },
            },
          ]
        : []),
    ]);

    return NextResponse.json({
      ok: true,
      invoiceVersionId: invoiceVersion.id,
      sentWithWarnings: warnings.length > 0 || undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    } satisfies SendInvoiceResponse);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error sending invoice";
    console.error("[invoices/send] Invoice Send Failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
