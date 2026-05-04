import "server-only";
export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type SupportedInvoiceDocumentKind = "invoice_pdf";
const SUPPORTED_KINDS: ReadonlySet<SupportedInvoiceDocumentKind> = new Set(["invoice_pdf"]);

function extract(req: NextRequest): { invoiceId: string | null; kind: string | null } {
  const m = req.nextUrl.pathname.match(/\/api\/invoices\/([^/]+)\/documents\/([^/]+)\/signed$/);
  return { invoiceId: m?.[1] ?? null, kind: m?.[2] ?? null };
}

function isSupportedKind(kind: string): kind is SupportedInvoiceDocumentKind {
  return SUPPORTED_KINDS.has(kind as SupportedInvoiceDocumentKind);
}

function isSafeStoragePath(path: string): boolean {
  if (!path || path.startsWith("/")) return false;
  if (path.includes("..")) return false;
  if (path.includes("//")) return false;
  return true;
}

export async function GET(req: NextRequest) {
  const { invoiceId, kind } = extract(req);
  if (!invoiceId || !kind) return NextResponse.json({ ok: false, error: "Missing params" }, { status: 400 });
  if (!isSupportedKind(kind)) {
    return NextResponse.json({ ok: false, error: "Invalid kind" }, { status: 400 });
  }

  const supabase = createRouteHandlerClient<DB>({ cookies });
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select("id, customer_id, shop_id, work_order_id")
    .eq("id", invoiceId)
    .maybeSingle();

  if (invErr) return NextResponse.json({ ok: false, error: invErr.message }, { status: 400 });
  if (!invoice?.id || !invoice.customer_id) {
    return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
  }

  const { data: customer, error: customerErr } = await supabase
    .from("customers")
    .select("id, shop_id")
    .eq("id", invoice.customer_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (customerErr) return NextResponse.json({ ok: false, error: customerErr.message }, { status: 400 });
  if (!customer?.id) {
    return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
  }

  if (invoice.shop_id !== customer.shop_id) {
    return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
  }

  if (invoice.work_order_id) {
    const { data: workOrder, error: workOrderErr } = await supabase
      .from("work_orders")
      .select("id, customer_id, shop_id")
      .eq("id", invoice.work_order_id)
      .maybeSingle();

    if (workOrderErr) return NextResponse.json({ ok: false, error: workOrderErr.message }, { status: 400 });
    if (!workOrder?.id) {
      return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
    }

    if (
      workOrder.customer_id !== invoice.customer_id ||
      workOrder.customer_id !== customer.id ||
      workOrder.shop_id !== invoice.shop_id ||
      workOrder.shop_id !== customer.shop_id
    ) {
      return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
    }
  }

  const { data: doc, error } = await supabase
    .from("invoice_documents")
    .select("storage_bucket, storage_path, shop_id, invoice_id")
    .eq("invoice_id", invoiceId)
    .eq("kind", kind)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  if (!doc?.storage_bucket || !doc?.storage_path) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (doc.invoice_id !== invoice.id || doc.shop_id !== invoice.shop_id || doc.shop_id !== customer.shop_id) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  if (!isSafeStoragePath(doc.storage_path)) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const { data: signed, error: sErr } = await supabase.storage
    .from(doc.storage_bucket)
    .createSignedUrl(doc.storage_path, 60 * 10); // 10 minutes

  if (sErr || !signed?.signedUrl) {
    return NextResponse.json({ ok: false, error: sErr?.message ?? "Signed URL failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, url: signed.signedUrl });
}
