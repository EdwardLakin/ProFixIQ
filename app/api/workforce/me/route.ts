import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

export async function GET() {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;

  const admin = createAdminSupabase() as any;
  const shopId = access.profile.shop_id;
  const userId = access.profile.id;
  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  const [
    { data: currentShift },
    { data: nextOverride },
    { data: templates },
    { data: period },
    { data: requests },
  ] =
    await Promise.all([
      admin
        .from("tech_shifts")
        .select("id, status, start_time, end_time")
        .eq("shop_id", shopId)
        .eq("user_id", userId)
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
        .eq("status", "scheduled")
        .gte("schedule_date", today)
        .order("schedule_date", { ascending: true })
        .limit(1)
        .maybeSingle(),
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
    ]);

  let nextSchedule = nextOverride
    ? {
        id: nextOverride.id,
        schedule_date: nextOverride.schedule_date,
        start_at: nextOverride.start_time
          ? String(nextOverride.start_time).includes("T")
            ? nextOverride.start_time
            : `${nextOverride.schedule_date}T${nextOverride.start_time}`
          : null,
        end_at: nextOverride.end_time
          ? String(nextOverride.end_time).includes("T")
            ? nextOverride.end_time
            : `${nextOverride.schedule_date}T${nextOverride.end_time}`
          : null,
        source: "override",
      }
    : null;

  if (!nextSchedule) {
    for (let offset = 0; offset < 15 && !nextSchedule; offset += 1) {
      const date = new Date(`${today}T12:00:00.000Z`);
      date.setUTCDate(date.getUTCDate() + offset);
      const dateKey = date.toISOString().slice(0, 10);
      const template = (templates ?? []).find(
        (candidate: Record<string, unknown>) =>
          Number(candidate.day_of_week) === date.getUTCDay() &&
          (!candidate.effective_from ||
            String(candidate.effective_from) <= dateKey) &&
          (!candidate.effective_to || String(candidate.effective_to) >= dateKey),
      );
      if (template?.start_time) {
        nextSchedule = {
          id: template.id,
          schedule_date: dateKey,
          start_at: `${dateKey}T${template.start_time}`,
          end_at: template.end_time
            ? `${dateKey}T${template.end_time}`
            : null,
          source: "template",
        };
      }
    }
  }

  let periodSummary = null;
  if (period?.id) {
    const { data: entries } = await admin
      .from("payroll_time_entries")
      .select("worked_minutes, regular_minutes, overtime_minutes, job_minutes, flagged_minutes, has_exceptions")
      .eq("shop_id", shopId)
      .eq("period_id", period.id)
      .eq("user_id", userId);

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
    current_shift: currentShift ?? null,
    next_schedule: nextSchedule,
    current_period: periodSummary,
    requests: requests ?? [],
  });
}
