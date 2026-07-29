import "server-only";
export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { createAdminClient } from "@/features/integrations/shopreel/server/createAdminClient";
import { canonicalizeRole } from "@/features/shared/lib/rbac";


type SupportedInvoiceDocumentKind = "invoice_pdf" | "inspection_report";
const SUPPORTED_KINDS: ReadonlySet<SupportedInvoiceDocumentKind> = new Set([
  "invoice_pdf",
  "inspection_report",
]);

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

  const supabase = createServerSupabaseRoute();
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
  if (!invoice?.id) {
    return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("shop_id,role")
    .eq("id", user.id)
    .maybeSingle<{ shop_id: string | null; role: string | null }>();
  const staffRole = canonicalizeRole(profile?.role);
  const isStaff =
    profile?.shop_id === invoice.shop_id &&
    !["fleet_manager", "driver", "customer", "unknown"].includes(staffRole);

  let customer: { id: string; shop_id: string } | null = null;
  if (!isStaff) {
    if (!invoice.customer_id) {
      return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
    }
    const { data, error: customerErr } = await supabase
      .from("customers")
      .select("id, shop_id")
      .eq("id", invoice.customer_id)
      .eq("user_id", user.id)
      .maybeSingle<{ id: string; shop_id: string }>();
    if (customerErr) {
      return NextResponse.json({ ok: false, error: customerErr.message }, { status: 400 });
    }
    customer = data ?? null;
    if (!customer?.id || invoice.shop_id !== customer.shop_id) {
      return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
    }
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
      workOrder.shop_id !== invoice.shop_id ||
      (!isStaff &&
        (workOrder.customer_id !== customer?.id ||
          workOrder.shop_id !== customer?.shop_id))
    ) {
      return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
    }
  }

  // invoice_documents is intentionally staff-RLS-only. Portal access is
  // authorized above, then the admin client is limited to the exact verified
  // invoice/shop/document tuple.
  const admin = createAdminClient();
  const { data: doc, error } = await admin
    .from("invoice_documents")
    .select("storage_bucket, storage_path, shop_id, invoice_id")
    .eq("invoice_id", invoiceId)
    .eq("kind", kind)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  if (!doc?.storage_bucket || !doc?.storage_path) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (
    doc.invoice_id !== invoice.id ||
    doc.shop_id !== invoice.shop_id ||
    (!isStaff && doc.shop_id !== customer?.shop_id)
  ) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  if (!isSafeStoragePath(doc.storage_path)) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  if (
    kind === "inspection_report" &&
    !doc.storage_path.startsWith(
      `shops/${invoice.shop_id}/invoices/${invoice.id}/`,
    )
  ) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const { data: signed, error: sErr } = await admin.storage
    .from(doc.storage_bucket)
    .createSignedUrl(doc.storage_path, 60 * 10); // 10 minutes

  if (sErr || !signed?.signedUrl) {
    return NextResponse.json({ ok: false, error: sErr?.message ?? "Signed URL failed" }, { status: 500 });
  }

  if (req.nextUrl.searchParams.get("redirect") === "1") {
    return NextResponse.redirect(signed.signedUrl);
  }
  return NextResponse.json({ ok: true, url: signed.signedUrl });
}
