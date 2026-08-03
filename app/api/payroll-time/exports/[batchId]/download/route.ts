import { NextResponse } from "next/server";
import { requirePayrollReviewer } from "../../../_lib/auth";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

const SIGNED_TTL_SECONDS = 300;

export async function GET(_req: Request, context: { params: Promise<{ batchId: string }> }) {
  const auth = await requirePayrollReviewer();
  if (!auth.ok) return auth.response;

  const supabase = createAdminSupabase();
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

  const { data: recorded, error: recordError } = await supabase.rpc(
    "record_payroll_export_download_atomic",
    {
      p_shop_id: auth.me.shop_id!,
      p_actor_profile_id: auth.me.id,
      p_batch_id: batch.id,
    },
  );
  const recordedOk =
    recorded !== null &&
    typeof recorded === "object" &&
    !Array.isArray(recorded) &&
    "ok" in recorded &&
    recorded.ok === true;
  if (recordError || !recordedOk) {
    return NextResponse.json(
      {
        error: "Failed to record payroll export access",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ signedUrl: signed.signedUrl, expiresIn: SIGNED_TTL_SECONDS });
}
