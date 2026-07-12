import { NextResponse } from "next/server";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";
import { SHIFT_STATUSES } from "@/features/workforce/lib/shift-status";
import { closeAllActiveTechnicianJobLabor } from "@/features/work-orders/server/technicianJobLabor";
import { getOrCreateCurrentPeriod, rebuildPeriod } from "@/features/payroll-time/server/payrollTime";

type Caller = { id: string; shop_id: string | null };
type ShiftRow = {
  id: string;
  shop_id: string | null;
  user_id: string | null;
  start_time: string | null;
};
type ShiftLifecycleRpcRow = ShiftRow & {
  status: string | null;
  end_time: string | null;
  inserted_events?: unknown[] | null;
};

export async function POST() {
  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr)
    return NextResponse.json({ error: userErr.message }, { status: 500 });
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  if (!me?.shop_id)
    return NextResponse.json({ error: "Missing shop" }, { status: 403 });

  const admin = createAdminSupabase();

  const { data: shifts, error: shiftErr } = await admin
    .from("tech_shifts")
    .select("id, shop_id, user_id, start_time")
    .eq("user_id", me.id)
    .eq("status", SHIFT_STATUSES.active)
    .is("end_time", null)
    .order("start_time", { ascending: false })
    .limit(5);

  if (shiftErr)
    return NextResponse.json({ error: shiftErr.message }, { status: 500 });
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
  const closed = await closeAllActiveTechnicianJobLabor({
    supabase: admin,
    shopId: me.shop_id,
    technicianId: me.id,
    endedAtIso: now,
    reason: "shift_end",
    event: "job_stopped_at_end_day",
  });
  if (!closed.ok) {
    return NextResponse.json(
      {
        error: `Unable to stop active job timers before ending shift: ${closed.error}`,
      },
      { status: closed.status },
    );
  }

  const { data, error } = await (
    admin as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{
        data: ShiftLifecycleRpcRow[] | null;
        error: { message: string } | null;
      }>;
    }
  ).rpc("complete_canonical_shift", {
    p_shift_id: shift.id,
    p_shop_id: me.shop_id,
    p_user_id: shift.user_id ?? me.id,
    p_profile_id: shift.user_id ?? me.id,
    p_timestamp: now,
  });

  const row = data?.[0] ?? null;
  if (error || !row) {
    const message = error?.message ?? "Complete shift RPC returned no row";
    const status = message.toLowerCase().includes("no matching active shift")
      ? 409
      : 500;
    return NextResponse.json(
      { error: `complete_canonical_shift failed: ${message}` },
      { status },
    );
  }

  try {
    const { period } = await getOrCreateCurrentPeriod(me.shop_id, me.id);
    if (period?.id && (period.status === "open" || period.status === "draft")) {
      await rebuildPeriod({ shopId: me.shop_id, actorId: me.id, periodId: period.id });
    }
  } catch (payrollRefreshError) {
    console.error("payroll open-period refresh failed after shift end", payrollRefreshError);
  }

  return NextResponse.json({
    ok: true,
    shiftId: row.id,
    endedAt: row.end_time ?? now,
    jobTimersStopped: closed.closed.length,
  });
}
