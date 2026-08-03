import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type DB = Database;

type LegacyPunchLine = Pick<
  DB["public"]["Tables"]["work_order_lines"]["Row"],
  "id" | "shop_id" | "work_order_id" | "assigned_tech_id" | "punched_in_at" | "punched_out_at"
>;

export async function POST() {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageScheduling",
  });
  if (!access.ok) return access.response;
  const shopId = access.profile.shop_id;
  const actorProfileId = access.profile.id;
  const admin = createAdminSupabase();

  const { data: legacyLines, error: linesError } = await admin
    .from("work_order_lines")
    .select("id, shop_id, work_order_id, assigned_tech_id, punched_in_at, punched_out_at")
    .eq("shop_id", shopId)
    .not("assigned_tech_id", "is", null)
    .not("punched_in_at", "is", null)
    .not("punched_out_at", "is", null);

  if (linesError) {
    return NextResponse.json({ ok: false, error: linesError.message }, { status: 500 });
  }

  const rows = (legacyLines ?? []) as LegacyPunchLine[];
  if (!rows.length) {
    return NextResponse.json({ ok: true, inserted: 0, skippedExisting: 0, skippedAmbiguous: 0 });
  }

  const lineIds = rows.map((row) => row.id);

  const { data: existingSegments, error: segmentError } = await admin
    .from("work_order_line_labor_segments")
    .select("work_order_line_id")
    .in("work_order_line_id", lineIds);

  if (segmentError) {
    return NextResponse.json({ ok: false, error: segmentError.message }, { status: 500 });
  }

  const existingSet = new Set((existingSegments ?? []).map((segment) => segment.work_order_line_id));

  const payload: DB["public"]["Tables"]["work_order_line_labor_segments"]["Insert"][] = [];
  let skippedExisting = 0;
  let skippedAmbiguous = 0;

  for (const line of rows) {
    if (existingSet.has(line.id)) {
      skippedExisting += 1;
      continue;
    }

    const start = line.punched_in_at ? new Date(line.punched_in_at).getTime() : Number.NaN;
    const end = line.punched_out_at ? new Date(line.punched_out_at).getTime() : Number.NaN;

    if (
      !line.shop_id ||
      !line.work_order_id ||
      !line.assigned_tech_id ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end <= start
    ) {
      skippedAmbiguous += 1;
      continue;
    }

    payload.push({
      shop_id: line.shop_id,
      work_order_id: line.work_order_id,
      work_order_line_id: line.id,
      technician_id: line.assigned_tech_id,
      started_at: line.punched_in_at as string,
      ended_at: line.punched_out_at as string,
      source: "legacy_line_backfill",
      created_by: actorProfileId,
    });
  }

  if (!payload.length) {
    return NextResponse.json({
      ok: true,
      inserted: 0,
      skippedExisting,
      skippedAmbiguous,
    });
  }

  const { error: insertError } = await admin.from("work_order_line_labor_segments").insert(payload);

  if (insertError) {
    return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    inserted: payload.length,
    skippedExisting,
    skippedAmbiguous,
  });
}
