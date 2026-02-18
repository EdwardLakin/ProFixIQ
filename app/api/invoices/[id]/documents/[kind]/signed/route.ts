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