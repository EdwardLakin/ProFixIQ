import { NextResponse } from "next/server";
import { requirePayrollReviewer } from "../../../_lib/auth";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

const SIGNED_TTL_SECONDS = 300;

export async function GET(_req: Request, context: { params: Promise<{ batchId: string }> }) {
  const auth = await requirePayrollReviewer();
  if (!auth.ok) return auth.response;

  const supabase = createServerSupabaseRoute();
  const { batchId } = await context.params;

  const { data: batch, error: batchErr } = await supabase
    .from("payroll_export_batches")
    .select(
      "id, shop_id, period_id, provider_type, file_sha256, file_size_bytes, storage_bucket, storage_path, download_count",
    )
    .eq("id", batchId)
    .eq("shop_id", auth.me.shop_id)
    .maybeSingle();

  if (batchErr || !batch) {
    return NextResponse.json({ error: "Export batch not found" }, { status: 404 });
  }

  if (!batch.storage_bucket || !batch.storage_path) {
    return NextResponse.json({ error: "Export artifact unavailable" }, { status: 409 });
  }

  if (!batch.storage_path.startsWith(`${auth.me.shop_id}/`)) {
    return NextResponse.json({ error: "Invalid artifact path" }, { status: 400 });
  }

  const { data: signed, error: signedErr } = await supabase.storage
    .from(batch.storage_bucket)
    .createSignedUrl(batch.storage_path, SIGNED_TTL_SECONDS);

  if (signedErr || !signed?.signedUrl) {
    return NextResponse.json({ error: "Failed to prepare download" }, { status: 500 });
  }

  const now = new Date().toISOString();
  void supabase
    .from("payroll_export_batches")
    .update({
      download_count: Number(batch.download_count ?? 0) + 1,
      last_downloaded_at: now,
      last_downloaded_by: auth.me.id,
      updated_at: now,
    })
    .eq("id", batch.id)
    .eq("shop_id", auth.me.shop_id);

  void supabase.from("audit_logs").insert({
    shop_id: auth.me.shop_id,
    actor_id: auth.me.id,
    action: "payroll.export.downloaded",
    target_table: "payroll_export_batches",
    target_id: batch.id,
    metadata: {
      shop_id: auth.me.shop_id,
      period_id: batch.period_id,
      batch_id: batch.id,
      provider_type: batch.provider_type,
      file_sha256: batch.file_sha256,
      file_size_bytes: batch.file_size_bytes,
    },
  });

  return NextResponse.json({ signedUrl: signed.signedUrl, expiresIn: SIGNED_TTL_SECONDS });
}
