export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import {
  activeBrandFromFrozenDocument,
  getActiveBrandForRender,
} from "@/features/branding/server/getActiveBrandForRender";
import { isFrozenInvoiceDocumentConfiguration } from "@/features/invoices/lib/invoiceDocumentTheme";
import { canAccessInvoicePdf } from "@/features/invoices/server/authorizeInvoicePdfAccess";
import { getActiveInvoiceVersion } from "@/features/invoices/server/financialLifecycle";
import { getIssuableInvoiceSnapshot } from "@/features/invoices/server/getIssuableInvoiceSnapshot";
import {
  premiumInvoiceFilename,
  renderPremiumInvoicePdf,
} from "@/features/invoices/server/renderPremiumInvoicePdf";
import { overlayCanonicalDocumentIdentity } from "@/features/invoices/server/canonicalDocumentIdentity";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: workOrderId } = await context.params;
  if (!workOrderId) {
    return NextResponse.json(
      { error: "Missing work order id" },
      { status: 400 },
    );
  }

  try {
    // The session-scoped client keeps the lookup inside the caller's work-order
    // RLS boundary before the explicit financial authorization gate below.
    const { data: workOrder, error: workOrderError } = await supabase
      .from("work_orders")
      .select("id,shop_id,custom_id,customer_id")
      .eq("id", workOrderId)
      .maybeSingle<{
        id: string;
        shop_id: string;
        custom_id: string | null;
        customer_id: string | null;
      }>();
    if (workOrderError) throw workOrderError;
    if (!workOrder) {
      return NextResponse.json(
        { error: "Work order not found" },
        { status: 404 },
      );
    }

    // Resolve the immutable/currently issued document before authorization.
    // Billing staff may still fall back to a working draft below, but a portal
    // customer must have a customer-visible invoice version before the gate can
    // succeed. This prevents the service from rendering mutable draft totals to
    // an otherwise valid portal member.
    const activeVersion = await getActiveInvoiceVersion({
      supabase,
      workOrderId,
      shopId: workOrder.shop_id,
    });

    const allowed = await canAccessInvoicePdf({
      supabase,
      authUserId: user.id,
      shopId: workOrder.shop_id,
      customerId: workOrder.customer_id,
      customerVisibleDocument: activeVersion !== null,
    });
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const storedSnapshot =
      activeVersion?.snapshot ??
      (await getIssuableInvoiceSnapshot({
        supabase,
        workOrderId,
        shopId: workOrder.shop_id,
      }));
    const { data: invoice } = activeVersion?.invoice_id
      ? await supabase
          .from("invoices")
          .select("invoice_number,notes")
          .eq("id", activeVersion.invoice_id)
          .eq("shop_id", workOrder.shop_id)
          .maybeSingle<{
            invoice_number: string | null;
            notes: string | null;
          }>()
      : { data: null };
    const snapshot = overlayCanonicalDocumentIdentity(storedSnapshot, {
      workOrderNumber: workOrder.custom_id,
      invoiceNumber: invoice?.invoice_number ?? null,
    });
    const brand =
      activeVersion &&
      isFrozenInvoiceDocumentConfiguration(snapshot.documentConfiguration)
        ? activeBrandFromFrozenDocument(snapshot.documentConfiguration)
        : await getActiveBrandForRender(workOrder.shop_id);
    const pdfDocument = activeVersion
      ? {
          invoiceNumber:
            invoice?.invoice_number ?? snapshot.invoice?.invoice_number,
          versionNumber: activeVersion.version_number,
          status: activeVersion.lifecycle_status,
          issuedAt: activeVersion.issued_at,
          paidTotal: activeVersion.paid_total,
          refundedTotal: activeVersion.refunded_total,
          outstandingTotal: activeVersion.outstanding_total,
          notes: invoice?.notes ?? snapshot.invoice?.notes,
          draft: false,
        }
      : {
          invoiceNumber: null,
          versionNumber: null,
          status: "draft",
          issuedAt: null,
          paidTotal: 0,
          refundedTotal: 0,
          outstandingTotal: snapshot.total,
          notes: snapshot.invoice?.notes,
          draft: true,
        };
    const bytes = await renderPremiumInvoicePdf({
      snapshot,
      document: pdfDocument,
      brand,
    });
    const download = new URL(req.url).searchParams.get("download") === "1";

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${premiumInvoiceFilename(snapshot, pdfDocument)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Invoice PDF generation failed";
    console.error("[invoice-pdf] generation failed", { workOrderId, message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
