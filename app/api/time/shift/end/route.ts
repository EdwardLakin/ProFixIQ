import { NextResponse } from "next/server";
import { createAdminSupabase, createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

export async function POST() {
  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) return NextResponse.json({ error: userErr.message }, { status: 500 });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles")
    .select("id, shop_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!me?.shop_id) return NextResponse.json({ error: "Missing shop" }, { status: 403 });

  const admin = createAdminSupabase();

  const { data: activeJobs, error: activeJobsErr } = await admin
    .from("work_order_line_labor_segments")
    .select("id")
    .eq("technician_id", user.id)
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
    .select("id, shop_id, start_time")
    .eq("user_id", user.id)
    .eq("status", "open")
    .order("start_time", { ascending: false })
    .limit(5);

  if (shiftErr) return NextResponse.json({ error: shiftErr.message }, { status: 500 });
  const shift =
    (shifts ?? []).find((s) => s.shop_id === me.shop_id) ??
    (shifts ?? []).find((s) => s.shop_id == null) ??
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
  const { error: updErr } = await admin
    .from("tech_shifts")
    .update({ end_time: now, status: "closed", type: "shift" })
    .eq("id", shift.id);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  await admin.from("punch_events").insert({
    shift_id: shift.id,
    user_id: user.id,
    profile_id: user.id,
    event_type: "end_shift",
    timestamp: now,
  });

  return NextResponse.json({ ok: true, shiftId: shift.id, endedAt: now });
}
