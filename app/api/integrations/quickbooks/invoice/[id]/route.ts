export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { requireQuickBooksShopAccess } from "@/features/integrations/quickbooks/server/auth";
import { ensureActiveQuickBooksConnection } from "@/features/integrations/quickbooks/server/http";
import { syncInvoiceToQuickBooks } from "@/features/integrations/quickbooks/server/syncInvoice";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const params = await ctx.params;
    const invoiceId = String(params?.id ?? "").trim();

    if (!invoiceId) {
      return NextResponse.json({ ok: false, error: "Missing invoice id." }, { status: 400 });
    }

    const supabase = createServerSupabaseRoute();

    const auth = await requireQuickBooksShopAccess(supabase);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { shop, user } = auth.data;

    const connection = await ensureActiveQuickBooksConnection(supabase, shop.id);

    const result = await syncInvoiceToQuickBooks(
      supabase,
      connection,
      invoiceId,
      user.id,
      shop.id,
    );

    return NextResponse.json({
      ok: true,
      invoiceId,
      quickbooksInvoiceId: result.qbInvoiceId,
      docNumber: result.docNumber,
      alreadySynced: result.alreadySynced,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to sync invoice to QuickBooks.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}