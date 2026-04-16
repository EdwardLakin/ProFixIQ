import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabase, createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

type Action = "start_shift" | "end_shift" | "toggle_break" | "toggle_lunch";

type ShiftMode = "none" | "shift" | "break" | "lunch" | "ended";

type Caller = { id: string; shop_id: string | null };

async function authz() {
  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false as const, res: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }

  const { data: me } = await supabase
    .from("profiles")
    .select("id, shop_id")
    .eq("id", user.id)
    .maybeSingle<Caller>();

  if (!me?.shop_id) {
    return { ok: false as const, res: NextResponse.json({ error: "Missing shop" }, { status: 403 }) };
  }

  return { ok: true as const, me };
}

async function loadOpenShift(admin: ReturnType<typeof createAdminSupabase>, userId: string, shopId: string) {
  const { data } = await admin
    .from("tech_shifts")
    .select("id,start_time,type,status,end_time")
    .eq("shop_id", shopId)
    .eq("user_id", userId)
    .eq("status", "open")
    .is("end_time", null)
    .order("start_time", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ?? null;
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
  const current = await loadOpenShift(admin, a.me.id, shopId);

  const insertPunch = async (shiftId: string, eventType: Action | "break_end" | "lunch_end") => {
    const mapped = eventType === "toggle_break" ? "break_start" : eventType === "toggle_lunch" ? "lunch_start" : eventType;
    await admin.from("punch_events").insert({
      shift_id: shiftId,
      event_type: mapped,
      timestamp: now,
    });
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
        status: "open",
      })
      .select("id,start_time")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Failed to start shift" }, { status: 500 });
    }

    await insertPunch(data.id, "start_shift");
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
      .eq("assigned_tech_id", a.me.id)
      .not("punched_in_at", "is", null)
      .is("punched_out_at", null)
      .neq("status", "completed");

    const { error } = await admin
      .from("tech_shifts")
      .update({ end_time: now, status: "closed", type: "shift" })
      .eq("id", current.id)
      .eq("shop_id", shopId)
      .eq("user_id", a.me.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await insertPunch(current.id, "end_shift");
    return NextResponse.json({ ok: true, shiftId: null, startTime: null, mode: "ended" as ShiftMode });
  }

  if (body.action === "toggle_break") {
    const isEnding = current.type === "break";
    const { error } = await admin
      .from("tech_shifts")
      .update({ type: isEnding ? "shift" : "break", status: "open" })
      .eq("id", current.id)
      .eq("shop_id", shopId)
      .eq("user_id", a.me.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await insertPunch(current.id, isEnding ? "break_end" : "toggle_break");
    return NextResponse.json({ ok: true, shiftId: current.id, startTime: current.start_time, mode: (isEnding ? "shift" : "break") as ShiftMode });
  }

  if (body.action === "toggle_lunch") {
    const isEnding = current.type === "lunch";
    const { error } = await admin
      .from("tech_shifts")
      .update({ type: isEnding ? "shift" : "lunch", status: "open" })
      .eq("id", current.id)
      .eq("shop_id", shopId)
      .eq("user_id", a.me.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await insertPunch(current.id, isEnding ? "lunch_end" : "toggle_lunch");
    return NextResponse.json({ ok: true, shiftId: current.id, startTime: current.start_time, mode: (isEnding ? "shift" : "lunch") as ShiftMode });
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
