import { NextResponse } from "next/server";
import { createAdminSupabase, createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { SHIFT_STATUSES } from "@/features/workforce/lib/shift-status";

type Caller = { id: string; shop_id: string | null };
type ShiftRow = { id: string; shop_id: string | null; user_id: string | null; start_time: string | null };
type ShiftLifecycleRpcRow = ShiftRow & { status: string | null; end_time: string | null; inserted_events?: unknown[] | null };

export async function POST() {
  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) return NextResponse.json({ error: userErr.message }, { status: 500 });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let { data: me } = await supabase
    .from("profiles")
    .select("id, shop_id")
    .eq("id", user.id)
    .maybeSingle<Caller>();
  if (!me) {
    const byUser = await supabase
      .from("profiles")
      .select("id, shop_id")
      .eq("user_id", user.id)
      .maybeSingle<Caller>();
    me = byUser.data ?? null;
  }

  if (!me?.shop_id) return NextResponse.json({ error: "Missing shop" }, { status: 403 });

  const admin = createAdminSupabase();

  const { data: activeJobs, error: activeJobsErr } = await admin
    .from("work_order_line_labor_segments")
    .select("id")
    .eq("technician_id", me.id)
    .is("ended_at", null)
    .limit(2);

  if (activeJobsErr) return NextResponse.json({ error: activeJobsErr.message }, { status: 500 });
  if ((activeJobs?.length ?? 0) > 0) {
    return NextResponse.json(
      { error: `Cannot end shift while ${(activeJobs ?? []).length} job punch(es) are active.` },
      { status: 409 },
    );
  }

  const { data: shifts, error: shiftErr } = await admin
    .from("tech_shifts")
    .select("id, shop_id, user_id, start_time")
    .eq("user_id", me.id)
    .eq("status", SHIFT_STATUSES.active)
    .is("end_time", null)
    .order("start_time", { ascending: false })
    .limit(5);

  if (shiftErr) return NextResponse.json({ error: shiftErr.message }, { status: 500 });
  const shift =
    ((shifts ?? []) as ShiftRow[]).find((s) => s.shop_id === me.shop_id) ??
    ((shifts ?? []) as ShiftRow[]).find((s) => s.shop_id == null) ??
    null;
  if (!shift) {
    return NextResponse.json(
      {
        error:
          "No active shift found in your current shop scope. If you recently switched shops, refresh and start a new shift.",
      },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const { data, error } = await (admin as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: ShiftLifecycleRpcRow[] | null; error: { message: string } | null }> }).rpc("complete_canonical_shift", {
    p_shift_id: shift.id,
    p_shop_id: me.shop_id,
    p_user_id: shift.user_id ?? me.id,
    p_profile_id: shift.user_id ?? me.id,
    p_timestamp: now,
  });

  const row = data?.[0] ?? null;
  if (error || !row) {
    const message = error?.message ?? "Complete shift RPC returned no row";
    const status = message.toLowerCase().includes("no matching active shift") ? 409 : 500;
    return NextResponse.json({ error: `complete_canonical_shift failed: ${message}` }, { status });
  }

  return NextResponse.json({ ok: true, shiftId: row.id, endedAt: row.end_time ?? now });
}
