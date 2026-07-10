import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabase, createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import {
  PUNCH_EVENT_TYPES,
  SHIFT_ACTIVITIES,
  SHIFT_STATUSES,
  deriveCurrentShiftActivity,
  latestValidPunchEvent,
  type PunchEventType,
  type ShiftActivity,
  type ShiftStateDto,
  type ShiftStatus,
} from "@/features/workforce/lib/shift-status";

type Action = PunchEventType | "start_break" | "end_break" | "start_lunch" | "end_lunch" | "toggle_break" | "toggle_lunch";
type Caller = { id: string; shop_id: string | null };
type ActiveShift = { id: string; start_time: string | null; status: string | null; end_time: string | null; shop_id: string | null; user_id: string | null };
type PunchRow = { event_type: string | null; timestamp: string | null };

async function authz() {
  const supabase = createServerSupabaseRoute();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { ok: false as const, res: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };

  let { data: me } = await supabase.from("profiles").select("id, shop_id").eq("id", user.id).maybeSingle<Caller>();
  if (!me) {
    const byUser = await supabase.from("profiles").select("id, shop_id").eq("user_id", user.id).maybeSingle<Caller>();
    me = byUser.data ?? null;
  }
  if (!me?.shop_id) return { ok: false as const, res: NextResponse.json({ error: "Missing shop" }, { status: 403 }) };
  return { ok: true as const, me, authUserId: user.id };
}

async function loadActiveShift(admin: ReturnType<typeof createAdminSupabase>, userIds: string[], shopId: string) {
  const cleanUserIds = [...new Set(userIds.filter(Boolean))];
  if (cleanUserIds.length === 0) return null;
  const { data, error } = await admin
    .from("tech_shifts")
    .select("id,start_time,status,end_time,shop_id,user_id")
    .eq("shop_id", shopId)
    .in("user_id", cleanUserIds)
    .eq("status", SHIFT_STATUSES.active)
    .is("end_time", null)
    .order("start_time", { ascending: false })
    .limit(1)
    .maybeSingle<ActiveShift>();
  if (error) throw new Error(error.message);
  return data ?? null;
}

async function loadShiftEvents(admin: ReturnType<typeof createAdminSupabase>, shiftId: string | null) {
  if (!shiftId) return [] as PunchRow[];
  const { data, error } = await admin
    .from("punch_events")
    .select("event_type,timestamp")
    .eq("shift_id", shiftId)
    .order("timestamp", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as PunchRow[];
}

function toDto(shift: ActiveShift | null, events: PunchRow[]): ShiftStateDto {
  const latest = latestValidPunchEvent(events);
  const activity = deriveCurrentShiftActivity(events, Boolean(shift)) as ShiftActivity;
  return {
    shiftId: shift?.id ?? null,
    shiftStatus: (shift?.status as ShiftStatus | null) ?? null,
    activity,
    startTime: shift?.start_time ?? null,
    endTime: shift?.end_time ?? null,
    latestEventType: latest.eventType,
    latestEventAt: latest.eventAt,
  };
}

function actionToEvent(action: Action): PunchEventType | null {
  switch (action) {
    case "start_shift": return PUNCH_EVENT_TYPES.startShift;
    case "end_shift": return PUNCH_EVENT_TYPES.endShift;
    case "start_break":
    case "toggle_break": return PUNCH_EVENT_TYPES.breakStart;
    case "end_break": return PUNCH_EVENT_TYPES.breakEnd;
    case "start_lunch":
    case "toggle_lunch": return PUNCH_EVENT_TYPES.lunchStart;
    case "end_lunch": return PUNCH_EVENT_TYPES.lunchEnd;
    case "break_start":
    case "break_end":
    case "lunch_start":
    case "lunch_end": return action;
    default: return null;
  }
}

export async function GET() {
  const a = await authz();
  if (!a.ok) return a.res;
  const admin = createAdminSupabase();
  try {
    const shift = await loadActiveShift(admin, [a.me.id, a.authUserId], a.me.shop_id as string);
    const events = await loadShiftEvents(admin, shift?.id ?? null);
    return NextResponse.json({ ok: true, ...toDto(shift, events) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load shift state" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const a = await authz();
  if (!a.ok) return a.res;
  const body = (await req.json().catch(() => null)) as { action?: Action } | null;
  if (!body?.action) return NextResponse.json({ error: "Missing action" }, { status: 400 });
  const eventType = actionToEvent(body.action);
  if (!eventType) return NextResponse.json({ error: "Unsupported action" }, { status: 400 });

  const admin = createAdminSupabase();
  const now = new Date().toISOString();
  const shopId = a.me.shop_id as string;

  const insertPunch = async (shiftId: string, userId: string, type: PunchEventType) => {
    const payload = { shop_id: shopId, shift_id: shiftId, user_id: userId, profile_id: userId, event_type: type, timestamp: now };
    const { data, error } = await admin.from("punch_events").insert(payload as never).select("id").single<{ id: string }>();
    if (error || !data) throw new Error(`Punch event insert failed: ${error?.message ?? "missing inserted row"}`);
    return data.id;
  };

  try {
    const current = await loadActiveShift(admin, [a.me.id, a.authUserId], shopId);
    const activeShiftUserId = current?.user_id ?? a.me.id;
    const events = await loadShiftEvents(admin, current?.id ?? null);
    const activity = deriveCurrentShiftActivity(events, Boolean(current));

    if (eventType === PUNCH_EVENT_TYPES.startShift) {
      if (current) return NextResponse.json({ error: "Active shift already exists" }, { status: 409 });
      const { data, error } = await admin.from("tech_shifts").insert({ shop_id: shopId, user_id: a.me.id, start_time: now, end_time: null, type: "shift", status: SHIFT_STATUSES.active }).select("id,start_time,status,end_time,shop_id,user_id").single<ActiveShift>();
      if (error || !data) return NextResponse.json({ error: error?.message ?? "Failed to start shift" }, { status: 500 });
      try {
        await insertPunch(data.id, a.me.id, PUNCH_EVENT_TYPES.startShift);
      } catch (punchError) {
        await admin.from("tech_shifts").delete().eq("id", data.id).eq("shop_id", shopId).eq("user_id", a.me.id);
        return NextResponse.json({ error: punchError instanceof Error ? punchError.message : "Punch event insert failed" }, { status: 500 });
      }
      return NextResponse.json({ ok: true, ...toDto(data, [{ event_type: PUNCH_EVENT_TYPES.startShift, timestamp: now }]) });
    }

    if (!current) return NextResponse.json({ error: "No active shift" }, { status: 409 });

    if (eventType === PUNCH_EVENT_TYPES.breakStart && activity !== SHIFT_ACTIVITIES.working) return NextResponse.json({ error: "Cannot start break unless currently working" }, { status: 409 });
    if (eventType === PUNCH_EVENT_TYPES.breakEnd && activity !== SHIFT_ACTIVITIES.onBreak) return NextResponse.json({ error: "Cannot end break when not on break" }, { status: 409 });
    if (eventType === PUNCH_EVENT_TYPES.lunchStart && activity !== SHIFT_ACTIVITIES.working) return NextResponse.json({ error: "Cannot start lunch unless currently working" }, { status: 409 });
    if (eventType === PUNCH_EVENT_TYPES.lunchEnd && activity !== SHIFT_ACTIVITIES.onLunch) return NextResponse.json({ error: "Cannot end lunch when not on lunch" }, { status: 409 });

    if (eventType === PUNCH_EVENT_TYPES.endShift) {
      const insertedPunchIds: string[] = [];
      if (activity === SHIFT_ACTIVITIES.onBreak) insertedPunchIds.push(await insertPunch(current.id, activeShiftUserId, PUNCH_EVENT_TYPES.breakEnd));
      if (activity === SHIFT_ACTIVITIES.onLunch) insertedPunchIds.push(await insertPunch(current.id, activeShiftUserId, PUNCH_EVENT_TYPES.lunchEnd));
      insertedPunchIds.push(await insertPunch(current.id, activeShiftUserId, PUNCH_EVENT_TYPES.endShift));
      const { data, error } = await admin.from("tech_shifts").update({ end_time: now, status: SHIFT_STATUSES.completed, type: "shift" }).eq("id", current.id).eq("shop_id", shopId).eq("user_id", activeShiftUserId).eq("status", SHIFT_STATUSES.active).select("id,start_time,status,end_time,shop_id,user_id").maybeSingle<ActiveShift>();
      if (error || !data) {
        await admin.from("punch_events").delete().in("id", insertedPunchIds).eq("shift_id", current.id);
        return NextResponse.json({ error: error?.message ?? "Shift close failed: no matching active shift in this shop" }, { status: error ? 500 : 409 });
      }
      const closingEvents = insertedPunchIds.length === 2 && activity === SHIFT_ACTIVITIES.onBreak
        ? [{ event_type: PUNCH_EVENT_TYPES.breakEnd, timestamp: now }, { event_type: eventType, timestamp: now }]
        : insertedPunchIds.length === 2 && activity === SHIFT_ACTIVITIES.onLunch
          ? [{ event_type: PUNCH_EVENT_TYPES.lunchEnd, timestamp: now }, { event_type: eventType, timestamp: now }]
          : [{ event_type: eventType, timestamp: now }];
      return NextResponse.json({ ok: true, ...toDto(data, [...events, ...closingEvents]) });
    }

    await insertPunch(current.id, activeShiftUserId, eventType);
    return NextResponse.json({ ok: true, ...toDto(current, [...events, { event_type: eventType, timestamp: now }]) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Shift punch failed" }, { status: 500 });
  }
}
