import { NextResponse } from "next/server";
import { requirePayrollReviewer } from "../_lib/auth";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

const DEFAULT_LIMIT = 20;

export async function GET(req: Request) {
  const auth = await requirePayrollReviewer();
  if (!auth.ok) return auth.response;

  const supabase = createServerSupabaseRoute();
  const { searchParams } = new URL(req.url);
  const periodId = searchParams.get("period_id")?.trim() ?? "";

  let query = supabase
    .from("payroll_export_batches")
    .select(
      "id, period_id, provider_type, status, handoff_status, row_count, exported_at, exported_by, file_size_bytes, file_sha256, provider_template_version, download_count, last_downloaded_at, created_at",
    )
    .eq("shop_id", auth.me.shop_id)
    .order("exported_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (periodId) {
    query = query.eq("period_id", periodId);
  } else {
    query = query.limit(DEFAULT_LIMIT);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "Failed to load export history" }, { status: 500 });
  }

  return NextResponse.json({ batches: data ?? [] });
}
