import { NextResponse } from "next/server";
import { requirePayrollReviewer } from "../_lib/auth";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { workforceDisplayName } from "@/features/workforce/lib/roster";

const DEFAULT_LIMIT = 20;

export async function GET(req: Request) {
  const auth = await requirePayrollReviewer();
  if (!auth.ok) return auth.response;

  const supabase = createAdminSupabase();
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

  const batches = data ?? [];
  const exporterIds = [
    ...new Set(
      batches
        .map((batch) => batch.exported_by)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const { data: exporters, error: exporterError } = exporterIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, username, email")
        .eq("shop_id", auth.me.shop_id)
        .in("id", exporterIds)
    : { data: [], error: null };
  if (exporterError) {
    return NextResponse.json(
      { error: "Failed to resolve export history identities" },
      { status: 500 },
    );
  }
  const exporterNameById = new Map(
    (exporters ?? []).map((profile) => [
      profile.id,
      workforceDisplayName(profile),
    ]),
  );

  return NextResponse.json({
    batches: batches.map((batch) => ({
      ...batch,
      exported_by_name: batch.exported_by
        ? exporterNameById.get(batch.exported_by) ??
          "Employee profile unavailable"
        : null,
    })),
  });
}
