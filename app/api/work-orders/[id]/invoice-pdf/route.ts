export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import {
  activeBrandFromFrozenDocument,
  getActiveBrandForRender,
} from "@/features/branding/server/getActiveBrandForRender";
import { isFrozenInvoiceDocumentConfiguration } from "@/features/invoices/lib/invoiceDocumentTheme";
import { getActiveInvoiceVersion } from "@/features/invoices/server/financialLifecycle";
import { getInvoiceSnapshotForWorkOrder } from "@/features/invoices/server/getInvoiceSnapshot";
import {
  premiumInvoiceFilename,
  renderPremiumInvoicePdf,
} from "@/features/invoices/server/renderPremiumInvoicePdf";

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
    // The session-scoped client keeps the read inside the caller's shop RLS boundary.
    const { data: workOrder, error: workOrderError } = await supabase
      .from("work_orders")
      .select("id,shop_id")
      .eq("id", workOrderId)
      .maybeSingle<{ id: string; shop_id: string }>();
    if (workOrderError) throw workOrderError;
    if (!workOrder) {
      return NextResponse.json(
        { error: "Work order not found" },
        { status: 404 },
      );
    }

    const activeVersion = await getActiveInvoiceVersion({
      supabase,
      workOrderId,
      shopId: workOrder.shop_id,
    });
    const snapshot =
      activeVersion?.snapshot ??
      (await getInvoiceSnapshotForWorkOrder({ supabase, workOrderId }));
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
