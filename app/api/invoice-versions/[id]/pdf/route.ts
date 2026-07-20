export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import {
  activeBrandFromFrozenDocument,
  getActiveBrandForRender,
} from "@/features/branding/server/getActiveBrandForRender";
import { isFrozenInvoiceDocumentConfiguration } from "@/features/invoices/lib/invoiceDocumentTheme";
import { getInvoiceVersionById } from "@/features/invoices/server/invoiceVersionQueries";
import {
  premiumInvoiceFilename,
  renderPremiumInvoicePdf,
} from "@/features/invoices/server/renderPremiumInvoicePdf";

type DB = Database;

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const sessionClient = createServerSupabaseRoute();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  if (!id)
    return NextResponse.json(
      { error: "Missing invoice version id" },
      { status: 400 },
    );

  try {
    const admin = createClient<DB>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const version = await getInvoiceVersionById({
      supabase: admin,
      invoiceVersionId: id,
    });
    if (!version) {
      return NextResponse.json(
        { error: "Invoice version not found" },
        { status: 404 },
      );
    }

    const [{ data: profile }, { data: workOrder }] = await Promise.all([
      admin
        .from("profiles")
        .select("shop_id")
        .eq("id", user.id)
        .maybeSingle<{ shop_id: string | null }>(),
      admin
        .from("work_orders")
        .select("customer_id")
        .eq("id", version.work_order_id)
        .eq("shop_id", version.shop_id)
        .maybeSingle<{ customer_id: string | null }>(),
    ]);

    let customerAccess = false;
    if (workOrder?.customer_id) {
      const { data: customer } = await admin
        .from("customers")
        .select("user_id")
        .eq("id", workOrder.customer_id)
        .maybeSingle<{ user_id: string | null }>();
      customerAccess = customer?.user_id === user.id;
    }
    if (profile?.shop_id !== version.shop_id && !customerAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: invoice } = version.invoice_id
      ? await admin
          .from("invoices")
          .select("invoice_number,notes")
          .eq("id", version.invoice_id)
          .eq("shop_id", version.shop_id)
          .maybeSingle<{
            invoice_number: string | null;
            notes: string | null;
          }>()
      : { data: null };
    // New invoice versions carry an immutable renderer configuration. The
    // active-brand fallback is only for historical versions created before
    // document freezing was introduced.
    const brand = isFrozenInvoiceDocumentConfiguration(
      version.snapshot.documentConfiguration,
    )
      ? activeBrandFromFrozenDocument(version.snapshot.documentConfiguration)
      : await getActiveBrandForRender(version.shop_id);
    const pdfDocument = {
      invoiceNumber:
        invoice?.invoice_number ?? version.snapshot.invoice?.invoice_number,
      versionNumber: version.version_number,
      status: version.lifecycle_status,
      issuedAt: version.issued_at,
      paidTotal: version.paid_total,
      refundedTotal: version.refunded_total,
      outstandingTotal: version.outstanding_total,
      notes: invoice?.notes ?? version.snapshot.invoice?.notes,
      draft: false,
    };
    const bytes = await renderPremiumInvoicePdf({
      snapshot: version.snapshot,
      document: pdfDocument,
      brand,
    });
    const download = new URL(req.url).searchParams.get("download") === "1";

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${premiumInvoiceFilename(version.snapshot, pdfDocument)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Invoice PDF generation failed";
    console.error("[invoice-version-pdf] generation failed", {
      invoiceVersionId: id,
      message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
