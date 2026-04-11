import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { getActorCapabilities } from "@/features/shared/lib/rbac";

type DB = Database;

type LegacyPunchLine = Pick<
  DB["public"]["Tables"]["work_order_lines"]["Row"],
  "id" | "shop_id" | "work_order_id" | "assigned_tech_id" | "punched_in_at" | "punched_out_at"
>;

function mustEnv(name: string) {
  const value = process.env[name];
  if (!value || !value.trim()) throw new Error(`Missing env ${name}`);
  return value;
}

export async function POST() {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, shop_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile?.shop_id) {
    return NextResponse.json(
      { ok: false, error: profileError?.message ?? "Unable to resolve profile" },
      { status: 400 },
    );
  }

  const actor = getActorCapabilities({ role: profile.role });
  if (!actor.isKnownRole || !actor.canManageScheduling) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const admin = createClient<DB>(mustEnv("NEXT_PUBLIC_SUPABASE_URL"), mustEnv("SUPABASE_SERVICE_ROLE_KEY"));

  const { data: legacyLines, error: linesError } = await admin
    .from("work_order_lines")
    .select("id, shop_id, work_order_id, assigned_tech_id, punched_in_at, punched_out_at")
    .eq("shop_id", profile.shop_id)
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
      created_by: user.id,
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
