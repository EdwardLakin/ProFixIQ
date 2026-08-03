import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  getOrCreateCurrentPeriod,
  localDateToUtcBoundary,
  refreshOpenPeriodIfStale,
  splitIntervalByShopDay,
} from "@/features/payroll-time/server/payrollTime";
import { requirePayrollReviewer } from "../_lib/auth";
import { composeActiveWorkforceRoster } from "@/features/workforce/lib/roster";
type AdminClient = ReturnType<typeof createAdminSupabase>;
type PayrollProfile = {
  id?: string;
  full_name: string | null;
  username: string | null;
  email: string | null;
  role?: string | null;
};
type PayrollRosterRow = {
  user_id: string;
  payroll_ready: boolean | null;
  employment_status: string | null;
};
type PayrollEntryRow = {
  user_id: string;
  work_date: string;
  profiles: PayrollProfile | null;
  [key: string]: unknown;
};

function nextDateKey(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function templateMinutes(
  startTime: string | null,
  endTime: string | null,
  unpaidBreakMinutes: number | null,
) {
  if (!startTime || !endTime) return 0;
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  if (
    ![startHour, startMinute, endHour, endMinute].every(Number.isFinite)
  ) {
    return 0;
  }
  return Math.max(
    0,
    endHour * 60 +
      endMinute -
      (startHour * 60 + startMinute) -
      Number(unpaidBreakMinutes ?? 0),
  );
}

export async function GET(req: NextRequest) {
  const auth = await requirePayrollReviewer();
  if (!auth.ok) return auth.response;

  const admin: AdminClient = createAdminSupabase();
  const { me } = auth;
  const url = new URL(req.url);
  const periodId = url.searchParams.get("period_id");

  let current: Awaited<ReturnType<typeof getOrCreateCurrentPeriod>>;
  try {
    current = await getOrCreateCurrentPeriod(me.shop_id!);
  } catch (error) {
    console.error("payroll period initialization failed", error);
    return NextResponse.json(
      {
        error:
          "Payroll is temporarily unavailable. Recorded punches are safe; retry the payroll load.",
      },
      { status: 503 },
    );
  }
  const { data: shop, error: shopError } = await admin
    .from("shops")
    .select("timezone")
    .eq("id", me.shop_id)
    .maybeSingle();
  if (shopError) {
    return NextResponse.json({ error: shopError.message }, { status: 500 });
  }

  const { data: periods, error: periodErr } = await admin
    .from("payroll_pay_periods")
    .select("*")
    .eq("shop_id", me.shop_id)
    .order("period_start", { ascending: false })
    .limit(12);

  if (periodErr) return NextResponse.json({ error: periodErr.message }, { status: 500 });

  const requestedPeriod = periodId
    ? (periods ?? []).find((period) => period.id === periodId)
    : null;
  if (periodId && !requestedPeriod) {
    return NextResponse.json(
      { error: "Pay period not found for this shop." },
      { status: 404 },
    );
  }
  const activePeriodId =
    requestedPeriod?.id ?? current.period?.id ?? periods?.[0]?.id ?? null;
  if (!activePeriodId) return NextResponse.json({ periods: [], entries: [], exceptions: [] });

  let refreshState: Awaited<ReturnType<typeof refreshOpenPeriodIfStale>>;
  try {
    refreshState = await refreshOpenPeriodIfStale({
      shopId: me.shop_id!,
      actorId: me.id,
      periodId: activePeriodId,
    });
  } catch (error) {
    console.error("payroll period source refresh failed", error);
    return NextResponse.json(
      {
        error:
          "Payroll totals could not be assembled from recorded time. The source punches remain safe; retry the payroll load.",
      },
      { status: 503 },
    );
  }

  const [
    { data: entries, error: entriesErr },
    { data: exceptions, error: exErr },
    { data: workforceRoster, error: rosterErr },
    { data: shopProfiles, error: profilesErr },
  ] = await Promise.all([
    admin
      .from("payroll_time_entries")
      .select("*, profiles:user_id(full_name, username, email)")
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
      .select("user_id, payroll_ready, employment_status")
      .eq("shop_id", me.shop_id),
    admin
      .from("profiles")
      .select("id, full_name, username, email, role")
      .eq("shop_id", me.shop_id)
      .order("full_name", { ascending: true }),
  ]);

  if (entriesErr) return NextResponse.json({ error: entriesErr.message }, { status: 500 });
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
  if (rosterErr) return NextResponse.json({ error: rosterErr.message }, { status: 500 });
  if (profilesErr) return NextResponse.json({ error: profilesErr.message }, { status: 500 });

  const selectedPeriod = (periods ?? []).find(
    (period) => period.id === activePeriodId,
  );
  const timezone = shop?.timezone ?? "UTC";
  const periodStartIso = selectedPeriod
    ? localDateToUtcBoundary(selectedPeriod.period_start, timezone)
    : null;
  const periodEndIso = selectedPeriod
    ? localDateToUtcBoundary(nextDateKey(selectedPeriod.period_end), timezone)
    : null;

  let scheduleRows: Array<{ user_id: string; schedule_date: string; start_time: string | null; end_time: string | null; unpaid_break_minutes: number | null }> = [];
  let scheduleTemplates: Array<{
    user_id: string;
    day_of_week: number;
    is_working_day: boolean;
    start_time: string | null;
    end_time: string | null;
    unpaid_break_minutes: number | null;
    effective_from: string | null;
    effective_to: string | null;
  }> = [];
  let timeAwayRows: Array<{ user_id: string; starts_at: string; ends_at: string }> = [];
  if (periodStartIso && periodEndIso) {
    const [
      { data: scheduleData, error: scheduleError },
      { data: templateData, error: templateError },
      { data: awayData, error: awayError },
    ] = await Promise.all([
      admin.from("staff_schedule_overrides").select("user_id, schedule_date, start_time, end_time, unpaid_break_minutes").eq("shop_id", me.shop_id).gte("schedule_date", selectedPeriod.period_start).lte("schedule_date", selectedPeriod.period_end).eq("status", "scheduled"),
      admin.from("staff_schedule_templates").select("user_id, day_of_week, is_working_day, start_time, end_time, unpaid_break_minutes, effective_from, effective_to").eq("shop_id", me.shop_id),
      admin.from("staff_availability_blocks").select("user_id, starts_at, ends_at").eq("shop_id", me.shop_id).lt("starts_at", periodEndIso).gt("ends_at", periodStartIso),
    ]);
    const evidenceError = scheduleError ?? templateError ?? awayError;
    if (evidenceError) {
      return NextResponse.json(
        { error: evidenceError.message },
        { status: 500 },
      );
    }
    scheduleRows = (scheduleData ?? []) as typeof scheduleRows;
    scheduleTemplates = (templateData ?? []) as typeof scheduleTemplates;
    timeAwayRows = (awayData ?? []) as typeof timeAwayRows;
  }

  const scheduleMap = new Map<string, number>();
  for (const row of scheduleRows) {
    if (!row.start_time || !row.end_time) continue;
    const mins = Math.max(0, (new Date(row.end_time).getTime() - new Date(row.start_time).getTime()) / 60000 - Number(row.unpaid_break_minutes ?? 0));
    const key = `${row.user_id}|${row.schedule_date}`;
    scheduleMap.set(key, Math.round(mins));
  }

  const scheduledMinutesFor = (userId: string, workDate: string) => {
    const override = scheduleRows.find(
      (row) => row.user_id === userId && row.schedule_date === workDate,
    );
    if (override) {
      if (!override.start_time || !override.end_time) return 0;
      return Math.max(
        0,
        Math.round(
          (new Date(override.end_time).getTime() -
            new Date(override.start_time).getTime()) /
            60000,
        ) - Number(override.unpaid_break_minutes ?? 0),
      );
    }
    const dayOfWeek = new Date(`${workDate}T12:00:00.000Z`).getUTCDay();
    const template = scheduleTemplates.find(
      (row) =>
        row.user_id === userId &&
        row.day_of_week === dayOfWeek &&
        row.is_working_day &&
        (!row.effective_from || row.effective_from <= workDate) &&
        (!row.effective_to || row.effective_to >= workDate),
    );
    return template
      ? templateMinutes(
          template.start_time,
          template.end_time,
          template.unpaid_break_minutes,
        )
      : 0;
  };

  const awayMap = new Map<string, number>();
  for (const row of timeAwayRows) {
    for (const slice of splitIntervalByShopDay({
      start: row.starts_at,
      end: row.ends_at,
      timezone,
      rangeStart: periodStartIso ?? undefined,
      rangeEnd: periodEndIso ?? undefined,
    })) {
      const key = `${row.user_id}|${slice.workDate}`;
      awayMap.set(key, (awayMap.get(key) ?? 0) + slice.minutes);
    }
  }

  const workforceByUser = new Map(
    ((workforceRoster ?? []) as PayrollRosterRow[]).map((person) => [
      person.user_id,
      person,
    ]),
  );
  const activeRoster = composeActiveWorkforceRoster({
    profiles: ((shopProfiles ?? []) as PayrollProfile[]).filter(
      (profile): profile is PayrollProfile & { id: string } =>
        Boolean(profile.id),
    ),
    workforceProfiles: (workforceRoster ?? []) as PayrollRosterRow[],
  }).map((person) => ({
    user_id: person.id,
    payroll_ready: person.payrollReady,
    employment_status: person.employmentStatus,
    profiles: {
      id: person.id,
      full_name: person.fullName,
      username: person.username,
      email: person.email,
    },
  }));
  const eligibleRoster = activeRoster.filter(
    (person) => person.payroll_ready === true,
  );
  const entryRows = (entries ?? []) as unknown as PayrollEntryRow[];
  const entryUsers = new Set(entryRows.map((entry) => entry.user_id));
  const rosterEntries = activeRoster
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
      flagged_minutes: 0,
      adjustment_minutes: 0,
      has_exceptions: false,
      blocking_exception_count: 0,
      warning_exception_count: 0,
      approval_state: "draft",
      source_snapshot: {
        source: "active_workforce_roster",
        note:
          person.payroll_ready === true
            ? "No recorded shifts"
            : "Payroll setup incomplete",
      },
      profiles: person.profiles ?? null,
      roster_only: true,
      payroll_ready: person.payroll_ready === true,
      payroll_status_label:
        person.payroll_ready === true
          ? "No recorded shifts"
          : "Not payroll-ready — setup incomplete",
    }));

  const missingProfileUserIds = entryRows
    .filter((entry) => entry.user_id && !entry.profiles)
    .map((entry) => entry.user_id);
  const { data: fallbackProfiles, error: fallbackProfilesError } =
    missingProfileUserIds.length
      ? await admin
          .from("profiles")
          .select("id, full_name, username, email")
          .eq("shop_id", me.shop_id)
          .in("id", missingProfileUserIds)
      : { data: [], error: null };
  if (fallbackProfilesError) {
    return NextResponse.json(
      { error: fallbackProfilesError.message },
      { status: 500 },
    );
  }
  const fallbackProfileById = new Map(
    ((fallbackProfiles ?? []) as PayrollProfile[])
      .filter((profile): profile is PayrollProfile & { id: string } => Boolean(profile.id))
      .map((profile) => [profile.id, profile]),
  );

  const enrichedEntries = [...entryRows, ...rosterEntries].map((entry) => {
    const workforce = workforceByUser.get(entry.user_id);
    const payrollReady = workforce?.payroll_ready === true;
    return {
      ...entry,
      profiles:
        entry.profiles ?? fallbackProfileById.get(entry.user_id) ?? null,
      payroll_ready:
        "payroll_ready" in entry ? entry.payroll_ready : payrollReady,
      payroll_status_label:
        entry.payroll_status_label ??
        (payrollReady ? "Ready" : "Recorded time — setup incomplete"),
      scheduled_minutes:
        scheduleMap.get(`${entry.user_id}|${entry.work_date}`) ??
        scheduledMinutesFor(entry.user_id, entry.work_date),
      approved_time_away_minutes:
        awayMap.get(`${entry.user_id}|${entry.work_date}`) ?? 0,
    };
  });

  const recordedEmployees = new Set(
    entryRows
      .filter(
        (entry) =>
          Number(entry.worked_minutes ?? 0) > 0 ||
          Number(entry.attendance_minutes ?? 0) > 0 ||
          Number(entry.job_minutes ?? 0) > 0,
      )
      .map((entry) => entry.user_id),
  ).size;
  const trueZero = entryRows.length === 0 && !refreshState.hasSourceTime;
  return NextResponse.json({
    shopId: me.shop_id,
    timezone,
    settings: current.settings ?? null,
    canConfigure: ["owner", "admin"].includes(String(me.role ?? "")),
    periods: periods ?? [],
    activePeriodId,
    entries: enrichedEntries,
    exceptions: exceptions ?? [],
    refresh: refreshState,
    rosterSummary: {
      activeWorkforce: activeRoster.length,
      payrollEligible: eligibleRoster.length,
      payrollSetupIncomplete: Math.max(
        activeRoster.length - eligibleRoster.length,
        0,
      ),
      recordedEmployees,
    },
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


// Compatibility for older clients. All payroll settings writes are owned by
// the canonical settings route so validation, Owner PIN, and audit behavior
// cannot drift between surfaces.
export { PUT } from "../settings/route";
