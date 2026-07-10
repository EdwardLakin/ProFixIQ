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
type PunchRow = { id?: string | null; event_type: string | null; timestamp: string | null; created_at?: string | null };
type ShiftLifecycleRpcRow = ActiveShift & { inserted_events?: PunchRow[] | null };

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
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle<ActiveShift>();
  if (error) throw new Error(error.message);
  return data ?? null;
}

async function loadShiftEvents(admin: ReturnType<typeof createAdminSupabase>, shiftId: string | null) {
  if (!shiftId) return [] as PunchRow[];
  const { data, error } = await admin
    .from("punch_events")
    .select("id,event_type,timestamp,created_at")
    .eq("shift_id", shiftId)
    .order("timestamp", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
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

function rpcShift(row: ShiftLifecycleRpcRow): ActiveShift {
  return {
    id: row.id,
    start_time: row.start_time,
    status: row.status,
    end_time: row.end_time,
    shop_id: row.shop_id,
    user_id: row.user_id,
  };
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
    const payload = { shift_id: shiftId, user_id: userId, profile_id: userId, event_type: type, timestamp: now };
    const { data, error } = await admin.from("punch_events").insert(payload as never).select("id,event_type,timestamp,created_at").single<PunchRow>();
    if (error || !data) throw new Error(`Punch event insert failed: ${error?.message ?? "missing inserted row"}`);
    return data;
  };

  try {
    const current = await loadActiveShift(admin, [a.me.id, a.authUserId], shopId);
    const activeShiftUserId = current?.user_id ?? a.me.id;
    const events = await loadShiftEvents(admin, current?.id ?? null);
    const activity = deriveCurrentShiftActivity(events, Boolean(current));

    if (eventType === PUNCH_EVENT_TYPES.startShift) {
      const { data, error } = await (admin as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: ShiftLifecycleRpcRow[] | null; error: { message: string } | null }> }).rpc("start_canonical_shift", {
        p_shop_id: shopId,
        p_user_id: a.me.id,
        p_profile_id: a.me.id,
        p_timestamp: now,
      });
      const row = data?.[0] ?? null;
      if (error || !row) {
        const message = error?.message ?? "Start shift RPC returned no row";
        const status = message.toLowerCase().includes("active shift already exists") ? 409 : 500;
        return NextResponse.json({ error: `start_canonical_shift failed: ${message}` }, { status });
      }
      return NextResponse.json({ ok: true, ...toDto(rpcShift(row), row.inserted_events ?? []) });
    }

    if (!current) return NextResponse.json({ error: "No active shift" }, { status: 409 });

    if (eventType === PUNCH_EVENT_TYPES.breakStart && activity !== SHIFT_ACTIVITIES.working) return NextResponse.json({ error: "Cannot start break unless currently working" }, { status: 409 });
    if (eventType === PUNCH_EVENT_TYPES.breakEnd && activity !== SHIFT_ACTIVITIES.onBreak) return NextResponse.json({ error: "Cannot end break when not on break" }, { status: 409 });
    if (eventType === PUNCH_EVENT_TYPES.lunchStart && activity !== SHIFT_ACTIVITIES.working) return NextResponse.json({ error: "Cannot start lunch unless currently working" }, { status: 409 });
    if (eventType === PUNCH_EVENT_TYPES.lunchEnd && activity !== SHIFT_ACTIVITIES.onLunch) return NextResponse.json({ error: "Cannot end lunch when not on lunch" }, { status: 409 });

    if (eventType === PUNCH_EVENT_TYPES.endShift) {
      const { data, error } = await (admin as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: ShiftLifecycleRpcRow[] | null; error: { message: string } | null }> }).rpc("complete_canonical_shift", {
        p_shift_id: current.id,
        p_shop_id: shopId,
        p_user_id: activeShiftUserId,
        p_profile_id: activeShiftUserId,
        p_timestamp: now,
      });
      const row = data?.[0] ?? null;
      if (error || !row) {
        const message = error?.message ?? "Complete shift RPC returned no row";
        const status = message.toLowerCase().includes("no matching active shift") ? 409 : 500;
        return NextResponse.json({ error: `complete_canonical_shift failed: ${message}` }, { status });
      }
      return NextResponse.json({ ok: true, ...toDto(rpcShift(row), [...events, ...(row.inserted_events ?? [])]) });
    }

    const inserted = await insertPunch(current.id, activeShiftUserId, eventType);
    return NextResponse.json({ ok: true, ...toDto(current, [...events, inserted]) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Shift punch failed" }, { status: 500 });
  }
}
