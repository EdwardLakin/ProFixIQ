import { NextResponse, type NextRequest } from "next/server";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";
import type { Json } from "@shared/types/types/supabase";
import {
  closeAllActiveTechnicianJobLabor,
  getActiveTechnicianJobLabor,
  startTechnicianJobLabor,
} from "@/features/work-orders/server/technicianJobLabor";
import { logOperationalEvent } from "@/features/work-orders/server/logOperationalEvent";
import { normalizeWorkOrderLineStatus } from "@/features/work-orders/lib/line-status";
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

type Action =
  | PunchEventType
  | "start_break"
  | "end_break"
  | "start_lunch"
  | "end_lunch"
  | "toggle_break"
  | "toggle_lunch";
type Caller = { id: string; shop_id: string | null };
type ActiveShift = {
  id: string;
  start_time: string | null;
  status: string | null;
  end_time: string | null;
  shop_id: string | null;
  user_id: string | null;
};
type PunchRow = {
  id?: string | null;
  event_type: string | null;
  timestamp: string | null;
  created_at?: string | null;
};
type ResumeContextRow = {
  id: string;
  break_punch_id: string;
  work_order_id: string | null;
  work_order_line_id: string | null;
  assignment_id: string | null;
  paused_job_session_id: string | null;
  pause_reason: string | null;
  status: string | null;
  metadata: Json | null;
};
type ShiftLifecycleRpcRow = ActiveShift & {
  inserted_events?: PunchRow[] | null;
};

async function authz() {
  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user)
    return {
      ok: false as const,
      res: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    };

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
    return {
      ok: false as const,
      res: NextResponse.json({ error: "Missing shop" }, { status: 403 }),
    };
  return { ok: true as const, me, authUserId: user.id };
}

async function loadActiveShift(
  admin: ReturnType<typeof createAdminSupabase>,
  userIds: string[],
  shopId: string,
) {
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

async function loadShiftEvents(
  admin: ReturnType<typeof createAdminSupabase>,
  shiftId: string | null,
) {
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
  const activity = deriveCurrentShiftActivity(
    events,
    Boolean(shift),
  ) as ShiftActivity;
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
    case "start_shift":
      return PUNCH_EVENT_TYPES.startShift;
    case "end_shift":
      return PUNCH_EVENT_TYPES.endShift;
    case "start_break":
    case "toggle_break":
      return PUNCH_EVENT_TYPES.breakStart;
    case "end_break":
      return PUNCH_EVENT_TYPES.breakEnd;
    case "start_lunch":
    case "toggle_lunch":
      return PUNCH_EVENT_TYPES.lunchStart;
    case "end_lunch":
      return PUNCH_EVENT_TYPES.lunchEnd;
    case "break_start":
    case "break_end":
    case "lunch_start":
    case "lunch_end":
      return action;
    default:
      return null;
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

function table(supabase: ReturnType<typeof createAdminSupabase>, name: string) {
  return supabase.from(name as never) as any;
}

function resumeMessage(reason: string | null | undefined) {
  if (!reason)
    return "Break ended. The previous job was not resumed because the line is no longer available.";
  if (reason === "active_job_exists")
    return "Break ended. The previous job was not resumed because another job is already active.";
  if (reason === "inactive_shift")
    return "Break ended. The previous job was not resumed because your shift is no longer active.";
  if (reason === "line_ineligible")
    return "Break ended. The previous job was not resumed because the line is no longer available.";
  if (reason === "assignment_changed")
    return "Break ended. The previous job was not resumed because the line assignment changed.";
  return "Break ended. The previous job was not resumed because the line is no longer available.";
}

async function cancelPendingResumeContexts(params: {
  admin: ReturnType<typeof createAdminSupabase>;
  shopId: string;
  userId: string;
  now: string;
  reason: string;
}) {
  await table(params.admin, "workforce_job_resume_contexts")
    .update({
      status: "cancelled",
      cancelled_at: params.now,
      cancel_reason: params.reason,
      updated_at: params.now,
    })
    .eq("shop_id", params.shopId)
    .eq("user_id", params.userId)
    .eq("status", "pending");
}

async function createResumeContext(params: {
  admin: ReturnType<typeof createAdminSupabase>;
  shopId: string;
  userId: string;
  breakPunchId: string;
  pauseReason: "break" | "lunch";
  pausedAt: string;
  activeSegments: Array<{
    id: string;
    work_order_id: string | null;
    work_order_line_id: string | null;
  }>;
}) {
  if (params.activeSegments.length === 0) return null;
  const one =
    params.activeSegments.length === 1 ? params.activeSegments[0] : null;
  const status = one ? "pending" : "invalid";
  const payload = {
    shop_id: params.shopId,
    user_id: params.userId,
    break_punch_id: params.breakPunchId,
    work_order_id: one?.work_order_id ?? null,
    work_order_line_id: one?.work_order_line_id ?? null,
    assignment_id: null,
    paused_job_session_id: one?.id ?? null,
    pause_reason: params.pauseReason,
    status,
    paused_at: params.pausedAt,
    cancel_reason: one ? null : "multiple_active_jobs",
    metadata: { active_segment_ids: params.activeSegments.map((s) => s.id) },
    created_at: params.pausedAt,
    updated_at: params.pausedAt,
  };
  const { data, error } = await table(
    params.admin,
    "workforce_job_resume_contexts",
  )
    .insert(payload)
    .select(
      "id, break_punch_id, work_order_id, work_order_line_id, assignment_id, paused_job_session_id, pause_reason, status, metadata",
    )
    .single();
  if (error) throw new Error(`Resume context insert failed: ${error.message}`);
  return data as ResumeContextRow;
}

async function maybeResumeJobAfterBreak(params: {
  admin: ReturnType<typeof createAdminSupabase>;
  shopId: string;
  userId: string;
  breakPunchId: string | null;
  now: string;
  pauseReason: "break" | "lunch";
}) {
  if (!params.breakPunchId)
    return { resumed: false, message: null as string | null };
  const { data: context, error } = await table(
    params.admin,
    "workforce_job_resume_contexts",
  )
    .select(
      "id, break_punch_id, work_order_id, work_order_line_id, assignment_id, paused_job_session_id, pause_reason, status, metadata",
    )
    .eq("shop_id", params.shopId)
    .eq("user_id", params.userId)
    .eq("break_punch_id", params.breakPunchId)
    .eq("status", "pending")
    .maybeSingle();
  if (error) throw new Error(`Resume context lookup failed: ${error.message}`);
  const ctx = context as ResumeContextRow | null;
  if (!ctx?.work_order_line_id) return { resumed: false, message: null };

  const cancel = async (reason: string) => {
    await table(params.admin, "workforce_job_resume_contexts")
      .update({
        status: "cancelled",
        cancelled_at: params.now,
        cancel_reason: reason,
        updated_at: params.now,
      })
      .eq("id", ctx.id)
      .eq("status", "pending");
    await logOperationalEvent({
      supabase: params.admin,
      event: "resume_cancelled",
      actorId: params.userId,
      entityType: "work_order_line",
      entityId: ctx.work_order_line_id,
      at: params.now,
      details: {
        shop_id: params.shopId,
        technician_id: params.userId,
        work_order_id: ctx.work_order_id,
        work_order_line_id: ctx.work_order_line_id,
        break_punch_id: params.breakPunchId,
        reason,
      } as Json,
    });
    return { resumed: false, message: resumeMessage(reason) };
  };

  const activeJobs = await getActiveTechnicianJobLabor({
    supabase: params.admin,
    shopId: params.shopId,
    technicianId: params.userId,
  });
  if (activeJobs.error) throw new Error(activeJobs.error.message);
  if (activeJobs.data.length > 0) return cancel("active_job_exists");

  const shift = await loadActiveShift(
    params.admin,
    [params.userId],
    params.shopId,
  );
  if (!shift) return cancel("inactive_shift");

  const { data: line, error: lineErr } = await params.admin
    .from("work_order_lines")
    .select("id, work_order_id, shop_id, status, assigned_tech_id")
    .eq("id", ctx.work_order_line_id)
    .eq("shop_id", params.shopId)
    .maybeSingle<{
      id: string;
      work_order_id: string | null;
      shop_id: string | null;
      status: string | null;
      assigned_tech_id: string | null;
    }>();
  if (lineErr) throw new Error(lineErr.message);
  if (!line) return cancel("line_ineligible");
  if (line.assigned_tech_id && line.assigned_tech_id !== params.userId)
    return cancel("assignment_changed");
  const status = normalizeWorkOrderLineStatus(line.status);
  if (
    [
      "completed",
      "invoiced",
      "ready_to_invoice",
      "declined",
      "deferred",
    ].includes(status)
  )
    return cancel("line_ineligible");

  const result = await startTechnicianJobLabor({
    supabase: params.admin,
    lineId: ctx.work_order_line_id,
    technicianId: params.userId,
    startedAtIso: params.now,
    source: params.pauseReason === "break" ? "break_resume" : "lunch_resume",
  });
  if (!result.ok) return cancel("line_ineligible");

  await table(params.admin, "workforce_job_resume_contexts")
    .update({
      status: "resumed",
      resumed_at: params.now,
      updated_at: params.now,
    })
    .eq("id", ctx.id)
    .eq("status", "pending");
  await logOperationalEvent({
    supabase: params.admin,
    event:
      params.pauseReason === "break"
        ? "job_resumed_after_break"
        : "job_resumed_after_lunch",
    actorId: params.userId,
    entityType: "work_order_line",
    entityId: ctx.work_order_line_id,
    at: params.now,
    details: {
      shop_id: params.shopId,
      technician_id: params.userId,
      work_order_id: ctx.work_order_id,
      work_order_line_id: ctx.work_order_line_id,
      source_session_id: ctx.paused_job_session_id,
      break_punch_id: params.breakPunchId,
      reason: params.pauseReason,
    } as Json,
  });
  return {
    resumed: true,
    message: `${params.pauseReason === "break" ? "Break" : "Lunch"} ended — job timer resumed`,
  };
}

export async function GET() {
  const a = await authz();
  if (!a.ok) return a.res;
  const admin = createAdminSupabase();
  try {
    const shift = await loadActiveShift(
      admin,
      [a.me.id, a.authUserId],
      a.me.shop_id as string,
    );
    const events = await loadShiftEvents(admin, shift?.id ?? null);
    return NextResponse.json({ ok: true, ...toDto(shift, events) });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load shift state",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const a = await authz();
  if (!a.ok) return a.res;
  const body = (await req.json().catch(() => null)) as {
    action?: Action;
  } | null;
  if (!body?.action)
    return NextResponse.json({ error: "Missing action" }, { status: 400 });
  const eventType = actionToEvent(body.action);
  if (!eventType)
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });

  const admin = createAdminSupabase();
  const now = new Date().toISOString();
  const shopId = a.me.shop_id as string;

  const insertPunch = async (
    shiftId: string,
    userId: string,
    type: PunchEventType,
  ) => {
    const payload = {
      shift_id: shiftId,
      user_id: userId,
      profile_id: userId,
      event_type: type,
      timestamp: now,
    };
    const { data, error } = await admin
      .from("punch_events")
      .insert(payload as never)
      .select("id,event_type,timestamp,created_at")
      .single<PunchRow>();
    if (error || !data)
      throw new Error(
        `Punch event insert failed: ${error?.message ?? "missing inserted row"}`,
      );
    return data;
  };

  try {
    const current = await loadActiveShift(
      admin,
      [a.me.id, a.authUserId],
      shopId,
    );
    const activeShiftUserId = current?.user_id ?? a.me.id;
    const events = await loadShiftEvents(admin, current?.id ?? null);
    const activity = deriveCurrentShiftActivity(events, Boolean(current));

    if (eventType === PUNCH_EVENT_TYPES.startShift) {
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
      ).rpc("start_canonical_shift", {
        p_shop_id: shopId,
        p_user_id: a.me.id,
        p_profile_id: a.me.id,
        p_timestamp: now,
      });
      const row = data?.[0] ?? null;
      if (error || !row) {
        const message = error?.message ?? "Start shift RPC returned no row";
        const status = message
          .toLowerCase()
          .includes("active shift already exists")
          ? 409
          : 500;
        return NextResponse.json(
          { error: `start_canonical_shift failed: ${message}` },
          { status },
        );
      }
      return NextResponse.json({
        ok: true,
        ...toDto(rpcShift(row), row.inserted_events ?? []),
      });
    }

    if (!current)
      return NextResponse.json({ error: "No active shift" }, { status: 409 });

    if (
      eventType === PUNCH_EVENT_TYPES.breakStart &&
      activity !== SHIFT_ACTIVITIES.working
    )
      return NextResponse.json(
        { error: "Cannot start break unless currently working" },
        { status: 409 },
      );
    if (
      eventType === PUNCH_EVENT_TYPES.breakEnd &&
      activity !== SHIFT_ACTIVITIES.onBreak
    )
      return NextResponse.json(
        { error: "Cannot end break when not on break" },
        { status: 409 },
      );
    if (
      eventType === PUNCH_EVENT_TYPES.lunchStart &&
      activity !== SHIFT_ACTIVITIES.working
    )
      return NextResponse.json(
        { error: "Cannot start lunch unless currently working" },
        { status: 409 },
      );
    if (
      eventType === PUNCH_EVENT_TYPES.lunchEnd &&
      activity !== SHIFT_ACTIVITIES.onLunch
    )
      return NextResponse.json(
        { error: "Cannot end lunch when not on lunch" },
        { status: 409 },
      );

    if (eventType === PUNCH_EVENT_TYPES.endShift) {
      const closed = await closeAllActiveTechnicianJobLabor({
        supabase: admin,
        shopId,
        technicianId: activeShiftUserId,
        endedAtIso: now,
        reason: "shift_end",
        event: "job_stopped_at_end_day",
      });
      if (!closed.ok)
        return NextResponse.json(
          {
            error: `Unable to stop active job timers before ending shift: ${closed.error}`,
          },
          { status: closed.status },
        );
      await cancelPendingResumeContexts({
        admin,
        shopId,
        userId: activeShiftUserId,
        now,
        reason: "shift_ended",
      });
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
        p_shift_id: current.id,
        p_shop_id: shopId,
        p_user_id: activeShiftUserId,
        p_profile_id: activeShiftUserId,
        p_timestamp: now,
      });
      const row = data?.[0] ?? null;
      if (error || !row) {
        const message = error?.message ?? "Complete shift RPC returned no row";
        const status = message
          .toLowerCase()
          .includes("no matching active shift")
          ? 409
          : 500;
        return NextResponse.json(
          { error: `complete_canonical_shift failed: ${message}` },
          { status },
        );
      }
      return NextResponse.json({
        ok: true,
        ...toDto(rpcShift(row), [...events, ...(row.inserted_events ?? [])]),
        jobTimersStopped: closed.closed.length,
        breakOrLunchEnded:
          activity === SHIFT_ACTIVITIES.onBreak ||
          activity === SHIFT_ACTIVITIES.onLunch,
        message: `Shift ended${closed.closed.length ? ` — ${closed.closed.length} job timer${closed.closed.length === 1 ? "" : "s"} stopped` : ""}${activity === SHIFT_ACTIVITIES.onBreak || activity === SHIFT_ACTIVITIES.onLunch ? " — break/lunch ended" : ""}`,
      });
    }

    if (
      eventType === PUNCH_EVENT_TYPES.breakStart ||
      eventType === PUNCH_EVENT_TYPES.lunchStart
    ) {
      const pauseReason =
        eventType === PUNCH_EVENT_TYPES.breakStart ? "break" : "lunch";
      const activeJobs = await getActiveTechnicianJobLabor({
        supabase: admin,
        shopId,
        technicianId: activeShiftUserId,
      });
      if (activeJobs.error) throw new Error(activeJobs.error.message);
      const closed = await closeAllActiveTechnicianJobLabor({
        supabase: admin,
        shopId,
        technicianId: activeShiftUserId,
        endedAtIso: now,
        reason: pauseReason,
        event:
          pauseReason === "break"
            ? "job_paused_for_break"
            : "job_paused_for_lunch",
      });
      if (!closed.ok)
        return NextResponse.json(
          {
            error: `Unable to pause active job timer before starting ${pauseReason}: ${closed.error}`,
          },
          { status: closed.status },
        );
      const inserted = await insertPunch(
        current.id,
        activeShiftUserId,
        eventType,
      );
      if (activeJobs.data.length > 0 && inserted.id) {
        await createResumeContext({
          admin,
          shopId,
          userId: activeShiftUserId,
          breakPunchId: inserted.id,
          pauseReason,
          pausedAt: now,
          activeSegments: activeJobs.data,
        });
      }
      return NextResponse.json({
        ok: true,
        ...toDto(current, [...events, inserted]),
        jobTimerPaused: activeJobs.data.length === 1,
        autoResumeEligible: activeJobs.data.length === 1,
        message:
          activeJobs.data.length === 1
            ? `${pauseReason === "break" ? "Break" : "Lunch"} started — job timer paused`
            : undefined,
      });
    }

    // Checked append-only fallback: return NextResponse.json({ ok: true, ...toDto(current
    const inserted = await insertPunch(
      current.id,
      activeShiftUserId,
      eventType,
    );

    if (
      eventType === PUNCH_EVENT_TYPES.breakEnd ||
      eventType === PUNCH_EVENT_TYPES.lunchEnd
    ) {
      const pauseReason =
        eventType === PUNCH_EVENT_TYPES.breakEnd ? "break" : "lunch";
      const startEventType =
        eventType === PUNCH_EVENT_TYPES.breakEnd
          ? PUNCH_EVENT_TYPES.breakStart
          : PUNCH_EVENT_TYPES.lunchStart;
      const breakStart = [...events]
        .reverse()
        .find((event) => event.event_type === startEventType && event.id);
      const resume = await maybeResumeJobAfterBreak({
        admin,
        shopId,
        userId: activeShiftUserId,
        breakPunchId: breakStart?.id ?? null,
        now,
        pauseReason,
      });
      return NextResponse.json({
        ok: true,
        ...toDto(current, [...events, inserted]),
        jobTimerResumed: resume.resumed,
        resumeMessage: resume.message,
        message: resume.message ?? undefined,
      });
    }

    return NextResponse.json({
      ok: true,
      ...toDto(current, [...events, inserted]),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Shift punch failed" },
      { status: 500 },
    );
  }
}
