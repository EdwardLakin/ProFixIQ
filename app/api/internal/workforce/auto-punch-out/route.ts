import { NextResponse } from "next/server";
import { requireInternalApiSecret } from "@/features/shared/lib/server/api-route-guard";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  getRelevantScheduleDateKeys,
  isValidShopTimezone,
  resolveScheduledShiftEnd,
} from "@/features/workforce/server/autoPunchOut";
import type {
  AutoPunchScheduleOverride,
  AutoPunchScheduleTemplate,
} from "@/features/workforce/server/autoPunchOut";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 200;

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

async function loadActiveShiftPage(
  admin: ReturnType<typeof createAdminSupabase>,
  cursorId: string | null,
) {
  let query = admin
    .from("tech_shifts")
    .select("id, shop_id, user_id, start_time")
    .eq("status", "active")
    .is("end_time", null)
    .not("shop_id", "is", null)
    .not("user_id", "is", null)
    .not("start_time", "is", null)
    .order("id", { ascending: true })
    .limit(PAGE_SIZE);
  if (cursorId) query = query.gt("id", cursorId);
  return query;
}

async function run(req: Request) {
  const gate = authorize(req);
  if (!gate.ok) return gate.response;

  const admin = createAdminSupabase();
  const now = new Date();
  const failures: Array<{ shiftId: string; error: string }> = [];
  let inspected = 0;
  let punchedOut = 0;
  let cursorId: string | null = null;

  while (true) {
    const { data: shifts, error: shiftError } = await loadActiveShiftPage(
      admin,
      cursorId,
    );
    if (shiftError) throw shiftError;
    const activeShifts = (shifts ?? []) as ActiveShift[];
    if (activeShifts.length === 0) break;
    inspected += activeShifts.length;
    cursorId = activeShifts.at(-1)?.id ?? cursorId;

    const shopIds = [...new Set(activeShifts.map((shift) => shift.shop_id))];
    const userIds = [...new Set(activeShifts.map((shift) => shift.user_id))];
    const shopsResult = await admin
      .from("shops")
      .select("id, timezone")
      .in("id", shopIds);
    if (shopsResult.error) throw shopsResult.error;

    const timezoneByShop = new Map(
      ((shopsResult.data ?? []) as ShopRow[]).map((shop) => [
        shop.id,
        shop.timezone,
      ]),
    );
    const relevantDateKeys = [
      ...new Set(
        activeShifts.flatMap((shift) => {
          const timezone = timezoneByShop.get(shift.shop_id);
          return isValidShopTimezone(timezone)
            ? getRelevantScheduleDateKeys(shift.start_time, timezone)
            : [];
        }),
      ),
    ];

    const [templatesResult, overridesResult] = await Promise.all([
      admin
        .from("staff_schedule_templates")
        .select(
          "id, shop_id, user_id, day_of_week, is_working_day, start_time, end_time, effective_from, effective_to, created_at, updated_at",
        )
        .in("shop_id", shopIds)
        .in("user_id", userIds),
      relevantDateKeys.length > 0
        ? admin
            .from("staff_schedule_overrides")
            .select(
              "id, shop_id, user_id, schedule_date, start_time, end_time, status, created_at, updated_at",
            )
            .in("shop_id", shopIds)
            .in("user_id", userIds)
            .in("schedule_date", relevantDateKeys)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (templatesResult.error) throw templatesResult.error;
    if (overridesResult.error) throw overridesResult.error;

    const templates =
      (templatesResult.data ?? []) as AutoPunchScheduleTemplate[];
    const overrides =
      (overridesResult.data ?? []) as AutoPunchScheduleOverride[];

    for (const shift of activeShifts) {
      const timezone = timezoneByShop.get(shift.shop_id);
      if (!isValidShopTimezone(timezone)) {
        failures.push({
          shiftId: shift.id,
          error: "Shop timezone is missing or invalid",
        });
        continue;
      }

      const schedule = resolveScheduledShiftEnd({
        shopId: shift.shop_id,
        userId: shift.user_id,
        shiftStartedAt: shift.start_time,
        timezone,
        templates,
        overrides,
      });
      if (!schedule) continue;
      const scheduledEnd = new Date(schedule.scheduledEndIso);
      if (scheduledEnd.getTime() > now.getTime()) continue;

      try {
        const { data, error } = await (admin as unknown as {
          rpc: (
            name: string,
            args: Record<string, unknown>,
          ) => PromiseLike<{
            data: Record<string, unknown> | null;
            error: { message: string } | null;
          }>;
        }).rpc("complete_scheduled_shift_end_atomic", {
          p_shift_id: shift.id,
          p_shop_id: shift.shop_id,
          p_user_id: shift.user_id,
          p_scheduled_end: schedule.scheduledEndIso,
          p_execution_time: now.toISOString(),
          p_schedule_source: schedule.source,
          p_schedule_date: schedule.dateKey,
        });
        if (error) throw new Error(error.message);
        if (data?.closed === true) punchedOut += 1;
      } catch (error) {
        failures.push({
          shiftId: shift.id,
          error:
            error instanceof Error
              ? error.message
              : "Unknown auto punch-out failure",
        });
      }
    }

    if (activeShifts.length < PAGE_SIZE) break;
  }

  return NextResponse.json({
    ok: failures.length === 0,
    inspected,
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
