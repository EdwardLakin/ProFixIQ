import { NextResponse } from "next/server";
import { requireInternalApiSecret } from "@/features/shared/lib/server/api-route-guard";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { closeAllActiveTechnicianJobLabor } from "@/features/work-orders/server/technicianJobLabor";
import { resolveScheduledShiftEnd } from "@/features/workforce/server/autoPunchOut";
import type {
  AutoPunchScheduleOverride,
  AutoPunchScheduleTemplate,
} from "@/features/workforce/server/autoPunchOut";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ActiveShift = {
  id: string;
  shop_id: string;
  user_id: string;
  start_time: string;
};

type ShopRow = { id: string; timezone: string | null };

function authorize(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (
    cronSecret &&
    req.headers.get("authorization") === `Bearer ${cronSecret}`
  ) {
    return { ok: true } as const;
  }
  return requireInternalApiSecret({
    request: req,
    envSecretName: "INTERNAL_WORKFORCE_GUARD_SECRET",
    headerName: "x-internal-workforce-guard-secret",
    routeLabel: "internal/workforce/auto-punch-out",
  });
}

async function run(req: Request) {
  const gate = authorize(req);
  if (!gate.ok) return gate.response;

  const admin = createAdminSupabase();
  const now = new Date();
  const { data: shifts, error: shiftError } = await admin
    .from("tech_shifts")
    .select("id, shop_id, user_id, start_time")
    .eq("status", "active")
    .is("end_time", null)
    .not("shop_id", "is", null)
    .not("user_id", "is", null)
    .not("start_time", "is", null)
    .order("start_time", { ascending: true })
    .limit(500);
  if (shiftError) throw shiftError;

  const activeShifts = (shifts ?? []) as ActiveShift[];
  if (activeShifts.length === 0) {
    return NextResponse.json({ ok: true, inspected: 0, punchedOut: 0, failures: [] });
  }

  const shopIds = [...new Set(activeShifts.map((shift) => shift.shop_id))];
  const userIds = [...new Set(activeShifts.map((shift) => shift.user_id))];
  const [shopsResult, templatesResult, overridesResult] = await Promise.all([
    admin.from("shops").select("id, timezone").in("id", shopIds),
    admin
      .from("staff_schedule_templates")
      .select("user_id, day_of_week, is_working_day, start_time, end_time, effective_from, effective_to")
      .in("shop_id", shopIds)
      .in("user_id", userIds),
    admin
      .from("staff_schedule_overrides")
      .select("user_id, schedule_date, start_time, end_time, status")
      .in("shop_id", shopIds)
      .in("user_id", userIds),
  ]);
  if (shopsResult.error) throw shopsResult.error;
  if (templatesResult.error) throw templatesResult.error;
  if (overridesResult.error) throw overridesResult.error;

  const timezoneByShop = new Map(
    ((shopsResult.data ?? []) as ShopRow[]).map((shop) => [
      shop.id,
      shop.timezone,
    ]),
  );
  const templates = (templatesResult.data ?? []) as AutoPunchScheduleTemplate[];
  const overrides = (overridesResult.data ?? []) as AutoPunchScheduleOverride[];
  const failures: Array<{ shiftId: string; error: string }> = [];
  let punchedOut = 0;

  for (const shift of activeShifts) {
    const schedule = resolveScheduledShiftEnd({
      userId: shift.user_id,
      shiftStartedAt: shift.start_time,
      timezone: timezoneByShop.get(shift.shop_id),
      templates,
      overrides,
    });
    if (!schedule) continue;

    const scheduledEnd = new Date(schedule.scheduledEndIso);
    if (scheduledEnd.getTime() > now.getTime()) continue;

    try {
      const operationKey = `auto-end-day:${shift.id}:${schedule.scheduledEndIso}`;
      const closed = await closeAllActiveTechnicianJobLabor({
        supabase: admin,
        shopId: shift.shop_id,
        technicianId: shift.user_id,
        operationKey,
        endedAtIso: schedule.scheduledEndIso,
        reason: "scheduled_shift_end",
        event: "job_stopped_at_scheduled_end_day",
        details: {
          shift_id: shift.id,
          schedule_source: schedule.source,
          schedule_date: schedule.dateKey,
          automatic: true,
        },
      });
      if (!closed.ok) throw new Error(closed.error);

      await admin
        .from("workforce_job_resume_contexts")
        .update({
          status: "cancelled",
          cancelled_at: schedule.scheduledEndIso,
          cancel_reason: "scheduled_shift_ended",
          updated_at: now.toISOString(),
        })
        .eq("shop_id", shift.shop_id)
        .eq("user_id", shift.user_id)
        .eq("status", "pending");

      const { data, error } = await (admin as unknown as {
        rpc: (
          name: string,
          args: Record<string, unknown>,
        ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
      }).rpc("complete_canonical_shift", {
        p_shift_id: shift.id,
        p_shop_id: shift.shop_id,
        p_user_id: shift.user_id,
        p_profile_id: shift.user_id,
        p_timestamp: schedule.scheduledEndIso,
      });

      if (error) {
        // A concurrent manual punch-out is a successful no-op for this guard.
        if (error.message.toLowerCase().includes("no matching active shift")) continue;
        throw new Error(error.message);
      }
      if (!data?.length) throw new Error("Canonical shift close returned no row");
      punchedOut += 1;
    } catch (error) {
      failures.push({
        shiftId: shift.id,
        error: error instanceof Error ? error.message : "Unknown auto punch-out failure",
      });
    }
  }

  return NextResponse.json({
    ok: failures.length === 0,
    inspected: activeShifts.length,
    punchedOut,
    failures,
  });
}

export async function GET(req: Request) {
  try {
    return await run(req);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Workforce auto punch-out guard failed",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}
