import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabase, createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { SHIFT_STATUSES } from "@/features/workforce/lib/shift-status";

type Action = "start_shift" | "end_shift" | "toggle_break" | "toggle_lunch";

type ShiftMode = "none" | "shift" | "break" | "lunch" | "ended";

type Caller = { id: string; shop_id: string | null };

type OpenShift = {
  id: string;
  start_time: string | null;
  type: "shift" | "break" | "lunch" | null;
  status: string | null;
  end_time: string | null;
  shop_id: string | null;
  user_id: string | null;
};

async function authz() {
  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false as const, res: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }

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

  if (!me?.shop_id) {
    return { ok: false as const, res: NextResponse.json({ error: "Missing shop" }, { status: 403 }) };
  }

  return { ok: true as const, me, authUserId: user.id };
}

async function loadOpenShift(admin: ReturnType<typeof createAdminSupabase>, userIds: string[], shopId: string) {
  const cleanUserIds = [...new Set(userIds.filter(Boolean))];
  if (cleanUserIds.length === 0) return null;

  const baseColumns = "id,start_time,type,status,end_time,shop_id,user_id";

  const { data: scopedOpen } = await admin
    .from("tech_shifts")
    .select(baseColumns)
    .eq("shop_id", shopId)
    .in("user_id", cleanUserIds)
    .eq("status", SHIFT_STATUSES.open)
    .is("end_time", null)
    .order("start_time", { ascending: false })
    .limit(1)
    .maybeSingle<OpenShift>();

  if (scopedOpen) return scopedOpen;

  const { data: scopedByEndTime } = await admin
    .from("tech_shifts")
    .select(baseColumns)
    .eq("shop_id", shopId)
    .in("user_id", cleanUserIds)
    .is("end_time", null)
    .order("start_time", { ascending: false })
    .limit(1)
    .maybeSingle<OpenShift>();

  if (scopedByEndTime) return scopedByEndTime;

  const { data: legacyNoShop } = await admin
    .from("tech_shifts")
    .select(baseColumns)
    .is("shop_id", null)
    .in("user_id", cleanUserIds)
    .eq("status", SHIFT_STATUSES.open)
    .is("end_time", null)
    .order("start_time", { ascending: false })
    .limit(1)
    .maybeSingle<OpenShift>();

  return legacyNoShop ?? null;
}

async function deriveMode(admin: ReturnType<typeof createAdminSupabase>, shift: OpenShift | null): Promise<ShiftMode> {
  if (!shift) return "none";

  const { data: lastPunch } = await admin
    .from("punch_events")
    .select("event_type")
    .eq("shift_id", shift.id)
    .order("timestamp", { ascending: false })
    .limit(1)
    .maybeSingle<{ event_type: string | null }>();

  const eventType = lastPunch?.event_type ?? null;
  if (eventType === "break_start") return "break";
  if (eventType === "lunch_start") return "lunch";
  if (eventType === "end_shift") return "ended";
  if (shift.type === "break") return "break";
  if (shift.type === "lunch") return "lunch";
  return "shift";
}

export async function GET() {
  const a = await authz();
  if (!a.ok) return a.res;

  const admin = createAdminSupabase();
  const shopId = a.me.shop_id;
  if (!shopId) {
    return NextResponse.json({ error: "Missing shop" }, { status: 403 });
  }
  const shift = await loadOpenShift(admin, [a.me.id, a.authUserId], shopId);
  const mode = await deriveMode(admin, shift);

  return NextResponse.json({
    ok: true,
    shiftId: shift?.id ?? null,
    startTime: shift?.start_time ?? null,
    mode,
  });
}

export async function POST(req: NextRequest) {
  const a = await authz();
  if (!a.ok) return a.res;

  const body = (await req.json().catch(() => null)) as { action?: Action } | null;
  if (!body?.action) {
    return NextResponse.json({ error: "Missing action" }, { status: 400 });
  }

  const admin = createAdminSupabase();
  const now = new Date().toISOString();
  const shopId = a.me.shop_id;
  if (!shopId) {
    return NextResponse.json({ error: "Missing shop" }, { status: 403 });
  }
  const current = await loadOpenShift(admin, [a.me.id, a.authUserId], shopId);
  const activeShiftUserId = current?.user_id ?? a.me.id;

  const insertPunch = async (shiftId: string, eventType: Action | "break_end" | "lunch_end") => {
    const mapped = eventType === "toggle_break" ? "break_start" : eventType === "toggle_lunch" ? "lunch_start" : eventType;
    const payload = {
      shop_id: shopId,
      shift_id: shiftId,
      user_id: activeShiftUserId,
      profile_id: activeShiftUserId,
      event_type: mapped,
      timestamp: now,
    };
    const { error } = await admin.from("punch_events").insert(payload as never);
    if (error && error.message.includes("shop_id")) {
      const withoutShopId = { ...payload };
      delete (withoutShopId as { shop_id?: string | null }).shop_id;
      const retry = await admin.from("punch_events").insert(withoutShopId as never);
      if (!retry.error) return;
      throw new Error(`Punch event insert failed: ${retry.error.message}`);
    }
    if (error) throw new Error(`Punch event insert failed: ${error.message}`);
  };

  if (body.action === "start_shift") {
    if (current) {
      return NextResponse.json({ ok: true, shiftId: current.id, startTime: current.start_time, mode: "shift" as ShiftMode });
    }

    const { data, error } = await admin
      .from("tech_shifts")
      .insert({
        shop_id: shopId,
        user_id: a.me.id,
        start_time: now,
        end_time: null,
        type: "shift",
        status: SHIFT_STATUSES.open,
      })
      .select("id,start_time")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Failed to start shift" }, { status: 500 });
    }

    try {
      await insertPunch(data.id, "start_shift");
    } catch (punchError) {
      await admin.from("tech_shifts").delete().eq("id", data.id).eq("shop_id", shopId);
      return NextResponse.json({ error: punchError instanceof Error ? punchError.message : "Punch event insert failed", partialFailure: { shiftWritten: true, compensated: true, shiftId: data.id } }, { status: 500 });
    }
    return NextResponse.json({ ok: true, shiftId: data.id, startTime: data.start_time, mode: "shift" as ShiftMode });
  }

  if (!current) {
    return NextResponse.json({ error: "Open shift not found" }, { status: 409 });
  }

  if (body.action === "end_shift") {
    await admin
      .from("work_order_lines")
      .update({ punched_out_at: now })
      .eq("shop_id", shopId)
      .eq("assigned_tech_id", activeShiftUserId)
      .not("punched_in_at", "is", null)
      .is("punched_out_at", null)
      .neq("status", "completed");

    const { data, error } = await admin
      .from("tech_shifts")
      .update({ end_time: now, status: SHIFT_STATUSES.closed, type: "shift" })
      .eq("id", current.id)
      .eq("shop_id", shopId)
      .eq("user_id", activeShiftUserId)
      .select("id")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Shift close failed: no matching open shift in this shop", shiftId: current.id }, { status: 409 });
    }

    try {
      await insertPunch(current.id, "end_shift");
    } catch (punchError) {
      return NextResponse.json({ error: punchError instanceof Error ? punchError.message : "Punch event insert failed", partialFailure: { shiftClosed: true, shiftId: current.id } }, { status: 500 });
    }
    return NextResponse.json({ ok: true, shiftId: null, startTime: null, mode: "ended" as ShiftMode });
  }

  if (body.action === "toggle_break") {
    const isEnding = current.type === "break";
    const { data, error } = await admin
      .from("tech_shifts")
      .update({ type: isEnding ? "shift" : "break", status: SHIFT_STATUSES.open })
      .eq("id", current.id)
      .eq("shop_id", shopId)
      .eq("user_id", activeShiftUserId)
      .select("id")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Shift update failed: no matching open shift in this shop", shiftId: current.id }, { status: 409 });
    }

    try {
      await insertPunch(current.id, isEnding ? "break_end" : "toggle_break");
    } catch (punchError) {
      return NextResponse.json({ error: punchError instanceof Error ? punchError.message : "Punch event insert failed", partialFailure: { shiftUpdated: true, shiftId: current.id } }, { status: 500 });
    }
    return NextResponse.json({ ok: true, shiftId: current.id, startTime: current.start_time, mode: (isEnding ? "shift" : "break") as ShiftMode });
  }

  if (body.action === "toggle_lunch") {
    const isEnding = current.type === "lunch";
    const { data, error } = await admin
      .from("tech_shifts")
      .update({ type: isEnding ? "shift" : "lunch", status: SHIFT_STATUSES.open })
      .eq("id", current.id)
      .eq("shop_id", shopId)
      .eq("user_id", activeShiftUserId)
      .select("id")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Shift update failed: no matching open shift in this shop", shiftId: current.id }, { status: 409 });
    }

    try {
      await insertPunch(current.id, isEnding ? "lunch_end" : "toggle_lunch");
    } catch (punchError) {
      return NextResponse.json({ error: punchError instanceof Error ? punchError.message : "Punch event insert failed", partialFailure: { shiftUpdated: true, shiftId: current.id } }, { status: 500 });
    }
    return NextResponse.json({ ok: true, shiftId: current.id, startTime: current.start_time, mode: (isEnding ? "shift" : "lunch") as ShiftMode });
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
