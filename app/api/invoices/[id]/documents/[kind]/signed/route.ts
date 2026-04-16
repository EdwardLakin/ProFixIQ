import "server-only";
export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

function extract(req: NextRequest): { invoiceId: string | null; kind: string | null } {
  const m = req.nextUrl.pathname.match(/\/api\/invoices\/([^/]+)\/documents\/([^/]+)\/signed$/);
  return { invoiceId: m?.[1] ?? null, kind: m?.[2] ?? null };
}

export async function GET(req: NextRequest) {
  const { invoiceId, kind } = extract(req);
  if (!invoiceId || !kind) return NextResponse.json({ ok: false, error: "Missing params" }, { status: 400 });

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
    .select("id, customer_id")
    .eq("id", invoiceId)
    .maybeSingle();

  if (invErr) return NextResponse.json({ ok: false, error: invErr.message }, { status: 400 });
  if (!invoice?.id || !invoice.customer_id) {
    return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
  }

  const { data: customer, error: customerErr } = await supabase
    .from("customers")
    .select("id")
    .eq("id", invoice.customer_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (customerErr) return NextResponse.json({ ok: false, error: customerErr.message }, { status: 400 });
  if (!customer?.id) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { data: doc, error } = await supabase
    .from("invoice_documents")
    .select("storage_bucket, storage_path")
    .eq("invoice_id", invoiceId)
    .eq("kind", kind)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  if (!doc?.storage_bucket || !doc?.storage_path) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const { data: signed, error: sErr } = await supabase.storage
    .from(doc.storage_bucket)
    .createSignedUrl(doc.storage_path, 60 * 10); // 10 minutes

  if (sErr || !signed?.signedUrl) {
    return NextResponse.json({ ok: false, error: sErr?.message ?? "Signed URL failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, url: signed.signedUrl });
}
