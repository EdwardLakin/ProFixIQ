import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import {
  getShopDayRange,
  getShopLocalDayWindow,
  shopLocalDateTimeToUtc,
} from "@/features/shared/lib/utils/shopDayWindow";
import {
  overlapMinutes,
  sumPairedOverlapDurations,
} from "@/features/workforce/lib/activityMetrics";
import {
  WORKFORCE_STAFF_ROLES,
  workforceDisplayName,
} from "@/features/workforce/lib/roster";

function addDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

type PunchEvidence = {
  id: string;
  shift_id: string | null;
  event_type: string | null;
  timestamp: string | null;
};

export async function GET() {
  const access = await requireShopScopedApiAccess({
    allowRoles: [...WORKFORCE_STAFF_ROLES],
  });
  if (!access.ok) return access.response;

  const admin = createAdminSupabase() as any;
  const shopId = access.profile.shop_id;
  const userId = access.profile.id;
  const now = new Date();
  const [profileResult, shopResult] = await Promise.all([
    admin
      .from("profiles")
      .select("id, full_name, username, email, role")
      .eq("shop_id", shopId)
      .eq("id", userId)
      .maybeSingle(),
    admin.from("shops").select("timezone").eq("id", shopId).maybeSingle(),
  ]);
  const identityError = profileResult.error ?? shopResult.error ?? null;
  if (identityError) {
    return NextResponse.json(
      { error: identityError.message },
      { status: 500 },
    );
  }
  const profile = profileResult.data;
  const shop = shopResult.data;
  if (!profile || !shop) {
    return NextResponse.json(
      { error: !profile ? "Employee profile not found" : "Shop not found" },
      { status: 404 },
    );
  }
  const timezone = getShopDayRange(shop?.timezone, now).timezone;
  const todayWindow = getShopLocalDayWindow(timezone, now);
  const today = todayWindow.localDayKey;

  const [
    currentShiftResult,
    templatesResult,
    overridesResult,
    periodResult,
    requestsResult,
    todayShiftsResult,
  ] =
    await Promise.all([
      admin
        .from("tech_shifts")
        .select("id, status, start_time, end_time")
        .eq("shop_id", shopId)
        .eq("user_id", userId)
        .eq("status", "active")
        .is("end_time", null)
        .order("start_time", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("staff_schedule_templates")
        .select(
          "id, day_of_week, start_time, end_time, effective_from, effective_to, is_working_day",
        )
        .eq("shop_id", shopId)
        .eq("user_id", userId)
        .eq("is_working_day", true),
      admin
        .from("staff_schedule_overrides")
        .select("id, schedule_date, start_time, end_time, unpaid_break_minutes, status")
        .eq("shop_id", shopId)
        .eq("user_id", userId)
        .gte("schedule_date", today)
        .lte("schedule_date", addDays(today, 14))
        .neq("status", "cancelled")
        .order("schedule_date", { ascending: true })
        .limit(30),
      admin
        .from("payroll_pay_periods")
        .select("id, period_start, period_end, status")
        .eq("shop_id", shopId)
        .lte("period_start", today)
        .gte("period_end", today)
        .order("period_start", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("staff_time_off_requests")
        .select("id, request_type, starts_at, ends_at, is_partial_day, status, reason, review_note, created_at")
        .eq("shop_id", shopId)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20),
      admin
        .from("tech_shifts")
        .select("id, start_time, end_time")
        .eq("shop_id", shopId)
        .eq("user_id", userId)
        .lt("start_time", todayWindow.dayEndIso)
        .or(`end_time.is.null,end_time.gt.${todayWindow.dayStartIso}`)
        .order("start_time", { ascending: true }),
    ]);
  const workforceError =
    currentShiftResult.error ??
    templatesResult.error ??
    overridesResult.error ??
    periodResult.error ??
    requestsResult.error ??
    todayShiftsResult.error ??
    null;
  if (workforceError) {
    return NextResponse.json(
      { error: workforceError.message },
      { status: 500 },
    );
  }
  const currentShift = currentShiftResult.data;
  const templates = templatesResult.data;
  const nextOverrides = overridesResult.data;
  const period = periodResult.data;
  const requests = requestsResult.data;
  const todayShifts = todayShiftsResult.data;

  let nextSchedule = null;
  for (let offset = 0; offset < 15 && !nextSchedule; offset += 1) {
    const dateKey = addDays(today, offset);
    const override = (nextOverrides ?? []).find(
      (candidate: Record<string, unknown>) =>
        String(candidate.schedule_date) === dateKey,
    );
    if (override) {
      if (override.start_time && override.end_time) {
        nextSchedule = {
          id: String(override.id),
          schedule_date: dateKey,
          start_at: String(override.start_time),
          end_at: String(override.end_time),
          source: "override" as const,
        };
      }
      // An override with no times intentionally marks the day off and blocks
      // the recurring template for that date.
      continue;
    }

    const date = new Date(`${dateKey}T12:00:00.000Z`);
    const template = (templates ?? []).find(
      (candidate: Record<string, unknown>) =>
        Number(candidate.day_of_week) === date.getUTCDay() &&
        (!candidate.effective_from ||
          String(candidate.effective_from) <= dateKey) &&
        (!candidate.effective_to || String(candidate.effective_to) >= dateKey),
    );
    if (template?.start_time) {
      nextSchedule = {
        id: String(template.id),
        schedule_date: dateKey,
        start_at: shopLocalDateTimeToUtc(
          dateKey,
          String(template.start_time),
          timezone,
        ),
        end_at: template.end_time
          ? shopLocalDateTimeToUtc(
              dateKey,
              String(template.end_time),
              timezone,
            )
          : null,
        source: "template" as const,
      };
    }
  }

  const todayShiftIds = (todayShifts ?? []).map(
    (shift: { id: string }) => shift.id,
  );
  const { data: todayPunches, error: punchError } = todayShiftIds.length
    ? await admin
        .from("punch_events")
        .select("id, shift_id, event_type, timestamp")
        .in("shift_id", todayShiftIds)
        .order("timestamp", { ascending: true })
    : { data: [], error: null };
  if (punchError) {
    return NextResponse.json({ error: punchError.message }, { status: 500 });
  }
  const evidenceEnd =
    now.getTime() < todayWindow.dayEndMs
      ? now.toISOString()
      : todayWindow.dayEndIso;
  const punches = (todayPunches ?? []) as PunchEvidence[];
  const grossMinutes = (todayShifts ?? []).reduce(
    (
      total: number,
      shift: { start_time: string; end_time: string | null },
    ) =>
      total +
      overlapMinutes(
        shift.start_time,
        shift.end_time,
        todayWindow.dayStartIso,
        evidenceEnd,
      ),
    0,
  );
  const breakMinutes = sumPairedOverlapDurations({
    events: punches,
    startType: "break_start",
    endType: "break_end",
    windowStart: todayWindow.dayStartIso,
    windowEnd: evidenceEnd,
  });
  const lunchMinutes = sumPairedOverlapDurations({
    events: punches,
    startType: "lunch_start",
    endType: "lunch_end",
    windowStart: todayWindow.dayStartIso,
    windowEnd: evidenceEnd,
  });

  let periodSummary = null;
  if (period?.id) {
    const { data: entries, error: entriesError } = await admin
      .from("payroll_time_entries")
      .select("worked_minutes, regular_minutes, overtime_minutes, job_minutes, flagged_minutes, has_exceptions")
      .eq("shop_id", shopId)
      .eq("period_id", period.id)
      .eq("user_id", userId);
    if (entriesError) {
      return NextResponse.json(
        { error: entriesError.message },
        { status: 500 },
      );
    }

    const totals = (entries ?? []).reduce(
      (sum: Record<string, number>, row: Record<string, unknown>) => ({
        worked_minutes: sum.worked_minutes + Number(row.worked_minutes ?? 0),
        regular_minutes: sum.regular_minutes + Number(row.regular_minutes ?? 0),
        overtime_minutes: sum.overtime_minutes + Number(row.overtime_minutes ?? 0),
        job_minutes: sum.job_minutes + Number(row.job_minutes ?? 0),
        flagged_minutes: sum.flagged_minutes + Number(row.flagged_minutes ?? 0),
        exception_days: sum.exception_days + (row.has_exceptions ? 1 : 0),
      }),
      {
        worked_minutes: 0,
        regular_minutes: 0,
        overtime_minutes: 0,
        job_minutes: 0,
        flagged_minutes: 0,
        exception_days: 0,
      },
    );
    periodSummary = { ...period, ...totals };
  }

  return NextResponse.json({
    profile: {
      id: userId,
      display_name: workforceDisplayName(profile),
      email: profile?.email ?? null,
      role: profile?.role ?? access.profile.role,
    },
    timezone,
    current_shift: currentShift ?? null,
    today_evidence: {
      gross_minutes: grossMinutes,
      break_minutes: breakMinutes,
      lunch_minutes: lunchMinutes,
      recorded_minutes: Math.max(
        0,
        grossMinutes - breakMinutes - lunchMinutes,
      ),
      punch_count: punches.length,
      punches: punches
        .filter(
          (event) =>
            event.timestamp &&
            new Date(event.timestamp).getTime() >= todayWindow.dayStartMs &&
            new Date(event.timestamp).getTime() < todayWindow.dayEndMs,
        )
        .map((event) => ({
          id: event.id,
          event_type: event.event_type,
          timestamp: event.timestamp,
        })),
    },
    next_schedule: nextSchedule,
    current_period: periodSummary,
    requests: requests ?? [],
  });
}
