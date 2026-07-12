import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { getOrCreateCurrentPeriod, refreshOpenPeriodIfStale } from "@/features/payroll-time/server/payrollTime";
import { requirePayrollReviewer } from "../_lib/auth";
type AdminClient = ReturnType<typeof createAdminSupabase>;

export async function GET(req: NextRequest) {
  const auth = await requirePayrollReviewer();
  if (!auth.ok) return auth.response;

  const admin: AdminClient = createAdminSupabase();
  const { me } = auth;
  const url = new URL(req.url);
  const periodId = url.searchParams.get("period_id");

  const current = await getOrCreateCurrentPeriod(me.shop_id!, me.id);

  const { data: periods, error: periodErr } = await admin
    .from("payroll_pay_periods")
    .select("*")
    .eq("shop_id", me.shop_id)
    .order("period_start", { ascending: false })
    .limit(12);

  if (periodErr) return NextResponse.json({ error: periodErr.message }, { status: 500 });

  const activePeriodId = periodId ?? current.period?.id ?? periods?.[0]?.id ?? null;
  if (!activePeriodId) return NextResponse.json({ periods: [], entries: [], exceptions: [] });

  const refreshState = await refreshOpenPeriodIfStale({ shopId: me.shop_id!, actorId: me.id, periodId: activePeriodId });

  const [{ data: entries, error: entriesErr }, { data: exceptions, error: exErr }, { data: roster }] = await Promise.all([
    admin
      .from("payroll_time_entries")
      .select("*, profiles:user_id(full_name, email)")
      .eq("shop_id", me.shop_id)
      .eq("period_id", activePeriodId)
      .order("work_date", { ascending: true }),
    admin
      .from("payroll_time_exceptions")
      .select("*")
      .eq("shop_id", me.shop_id)
      .eq("period_id", activePeriodId)
      .order("work_date", { ascending: true }),
    admin
      .from("people_workforce_profiles")
      .select("user_id, payroll_ready, employment_status, profiles:user_id(full_name, email)")
      .eq("shop_id", me.shop_id)
      .eq("payroll_ready", true)
      .eq("employment_status", "active"),
  ]);

  if (entriesErr) return NextResponse.json({ error: entriesErr.message }, { status: 500 });
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });

  const selectedPeriod = (periods ?? []).find((period) => period.id === activePeriodId);
  const periodStartIso = selectedPeriod ? `${selectedPeriod.period_start}T00:00:00.000Z` : null;
  const periodEndIso = selectedPeriod ? `${selectedPeriod.period_end}T23:59:59.999Z` : null;

  let scheduleRows: Array<{ user_id: string; schedule_date: string; start_time: string | null; end_time: string | null; unpaid_break_minutes: number | null }> = [];
  let timeAwayRows: Array<{ user_id: string; starts_at: string; ends_at: string }> = [];
  if (periodStartIso && periodEndIso) {
    const [{ data: scheduleData }, { data: awayData }] = await Promise.all([
      admin.from("staff_schedule_overrides").select("user_id, schedule_date, start_time, end_time, unpaid_break_minutes").eq("shop_id", me.shop_id).gte("schedule_date", selectedPeriod.period_start).lte("schedule_date", selectedPeriod.period_end).eq("status", "scheduled"),
      admin.from("staff_availability_blocks").select("user_id, starts_at, ends_at").eq("shop_id", me.shop_id).lte("starts_at", periodEndIso).gte("ends_at", periodStartIso),
    ]);
    scheduleRows = (scheduleData ?? []) as typeof scheduleRows;
    timeAwayRows = (awayData ?? []) as typeof timeAwayRows;
  }

  const scheduleMap = new Map<string, number>();
  for (const row of scheduleRows) {
    if (!row.start_time || !row.end_time) continue;
    const mins = Math.max(0, (new Date(row.end_time).getTime() - new Date(row.start_time).getTime()) / 60000 - Number(row.unpaid_break_minutes ?? 0));
    const key = `${row.user_id}|${row.schedule_date}`;
    scheduleMap.set(key, Math.round(mins));
  }

  const awayMap = new Map<string, number>();
  for (const row of timeAwayRows) {
    const start = new Date(row.starts_at).getTime();
    const end = new Date(row.ends_at).getTime();
    const minutes = Math.max(0, Math.round((end - start) / 60000));
    awayMap.set(row.user_id, (awayMap.get(row.user_id) ?? 0) + minutes);
  }

  const entryRows = (entries ?? []) as any[];
  const entryUsers = new Set(entryRows.map((entry) => entry.user_id));
  const rosterEntries = ((roster ?? []) as any[])
    .filter((person) => person.user_id && !entryUsers.has(person.user_id))
    .map((person) => ({
      id: `roster-${activePeriodId}-${person.user_id}`,
      shop_id: me.shop_id,
      period_id: activePeriodId,
      user_id: person.user_id,
      work_date: selectedPeriod?.period_start ?? new Date().toISOString().slice(0, 10),
      worked_minutes: 0,
      regular_minutes: 0,
      overtime_minutes: 0,
      unpaid_break_minutes: 0,
      paid_break_minutes: 0,
      attendance_minutes: 0,
      job_minutes: 0,
      adjustment_minutes: 0,
      has_exceptions: false,
      blocking_exception_count: 0,
      warning_exception_count: 0,
      approval_state: "draft",
      source_snapshot: { source: "payroll_eligible_roster", note: "No recorded shifts" },
      profiles: person.profiles ?? null,
      roster_only: true,
      payroll_status_label: "No recorded shifts",
    }));

  const missingProfileUserIds = entryRows
    .filter((entry) => entry.user_id && !entry.profiles)
    .map((entry) => entry.user_id);
  const { data: fallbackProfiles } = missingProfileUserIds.length
    ? await admin.from("profiles").select("id, full_name, email").eq("shop_id", me.shop_id).in("id", missingProfileUserIds)
    : { data: [] };
  const fallbackProfileById = new Map((fallbackProfiles ?? []).map((profile: any) => [profile.id, profile]));

  const enrichedEntries = [...entryRows, ...rosterEntries].map((entry) => ({
    ...entry,
    profiles: entry.profiles ?? fallbackProfileById.get(entry.user_id) ?? null,
    scheduled_minutes: scheduleMap.get(`${entry.user_id}|${entry.work_date}`) ?? 0,
    approved_time_away_minutes_in_period: awayMap.get(entry.user_id) ?? 0,
  }));

  const trueZero = enrichedEntries.length === 0 && !refreshState.hasSourceTime;
  return NextResponse.json({
    periods: periods ?? [],
    activePeriodId,
    entries: enrichedEntries,
    exceptions: exceptions ?? [],
    refresh: refreshState,
    zeroState: {
      trueZero,
      message: trueZero
        ? "No employee time has been recorded for this pay period."
        : refreshState.refreshError
          ? "Time records exist, but payroll totals could not be refreshed."
          : null,
    },
  });
}
