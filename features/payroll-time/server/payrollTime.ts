import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { createHash } from "crypto";
import { getShopDayRange } from "@/features/shared/lib/utils/shopDayWindow";
import { calculatePayPeriodBounds, type PayrollCadence } from "@/features/payroll-time/lib/payPeriodBounds";
import { applyWeeklyOvertime } from "@/features/payroll-time/lib/overtime";

export type PayrollPeriodStatus = "draft" | "open" | "approved" | "exported";

export type PayrollException = {
  user_id: string;
  work_date: string | null;
  severity: "warning" | "blocking";
  code: string;
  message: string;
  source_type: "attendance" | "job_time" | "manual_adjustment" | "system";
  source_ref: Record<string, unknown>;
};

const MINUTES_IN_HOUR = 60;

export class PayrollExportError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "PayrollExportError";
    this.status = status;
  }
}

function startOfUtcDay(dateIso: string): Date {
  const d = new Date(dateIso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function toShopDate(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export function localDateToUtcBoundary(dateKey: string, timezone: string): string {
  return getShopDayRange(timezone, new Date(`${dateKey}T12:00:00.000Z`)).start;
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function dateDiffMinutes(start: string, end: string): number {
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

export type ShopDaySlice = {
  workDate: string;
  start: string;
  end: string;
  minutes: number;
};

export function splitIntervalByShopDay(args: {
  start: string;
  end: string;
  timezone: string;
  rangeStart?: string;
  rangeEnd?: string;
}): ShopDaySlice[] {
  const rawStart = new Date(args.start).getTime();
  const rawEnd = new Date(args.end).getTime();
  const floor = args.rangeStart ? new Date(args.rangeStart).getTime() : rawStart;
  const ceiling = args.rangeEnd ? new Date(args.rangeEnd).getTime() : rawEnd;
  let cursor = Math.max(rawStart, floor);
  const limit = Math.min(rawEnd, ceiling);
  if (!Number.isFinite(cursor) || !Number.isFinite(limit) || limit <= cursor) return [];

  const slices: ShopDaySlice[] = [];
  while (cursor < limit) {
    const workDate = toShopDate(new Date(cursor).toISOString(), args.timezone);
    const date = startOfUtcDay(`${workDate}T00:00:00.000Z`);
    const nextDate = toIsoDate(addDays(date, 1));
    let nextBoundary = new Date(localDateToUtcBoundary(nextDate, args.timezone)).getTime();
    if (!Number.isFinite(nextBoundary) || nextBoundary <= cursor) nextBoundary = cursor + 24 * 60 * 60 * 1000;
    const sliceEnd = Math.min(limit, nextBoundary);
    slices.push({
      workDate,
      start: new Date(cursor).toISOString(),
      end: new Date(sliceEnd).toISOString(),
      minutes: Math.max(0, Math.round((sliceEnd - cursor) / 60000)),
    });
    cursor = sliceEnd;
  }
  return slices;
}

function overlapPairMinutes(
  pairs: Array<{ start: string; end: string }>,
  sliceStart: string,
  sliceEnd: string,
): number {
  const from = new Date(sliceStart).getTime();
  const to = new Date(sliceEnd).getTime();
  return pairs.reduce((total, pair) => {
    const start = Math.max(from, new Date(pair.start).getTime());
    const end = Math.min(to, new Date(pair.end).getTime());
    return total + (end > start ? Math.round((end - start) / 60000) : 0);
  }, 0);
}


export type PayrollPolicySnapshot = {
  paid_breaks_per_day: number;
  paid_break_duration_minutes: number;
  breaks_are_paid: boolean;
  lunch_is_paid: boolean;
  default_lunch_duration_minutes: number;
  lunch_required_after_minutes: number;
  daily_overtime_after_minutes: number;
  suspicious_shift_minutes: number;
};

function resolvePayrollPolicy(settings: any): PayrollPolicySnapshot {
  return {
    paid_breaks_per_day: Math.min(2, Math.max(0, Number(settings?.paid_breaks_per_day ?? 2))),
    paid_break_duration_minutes: Math.max(0, Number(settings?.paid_break_duration_minutes ?? 15)),
    breaks_are_paid: settings?.breaks_are_paid !== false,
    lunch_is_paid: settings?.lunch_is_paid === true,
    default_lunch_duration_minutes: Math.max(0, Number(settings?.default_lunch_duration_minutes ?? 30)),
    lunch_required_after_minutes: Math.max(0, Number(settings?.lunch_required_after_minutes ?? 300)),
    daily_overtime_after_minutes: Math.max(0, Number(settings?.daily_overtime_after_minutes ?? 480)),
    suspicious_shift_minutes: Math.max(60, Number(settings?.suspicious_shift_minutes ?? 960)),
  };
}

type PunchLike = { id?: string | null; event_type: string | null; timestamp: string | null };
type RestParseWarning = { code: string; message: string; event_id?: string | null; event_type?: string | null };

export function parsePayrollRestEvents(args: {
  events: PunchLike[];
  shiftStart: string;
  shiftEnd: string;
  policy: PayrollPolicySnapshot;
}) {
  let activeBreakStart: { ts: string; id?: string | null } | null = null;
  let activeLunchStart: { ts: string; id?: string | null } | null = null;
  const breakPairs: Array<{ start: string; end: string; minutes: number; start_event_id?: string | null; end_event_id?: string | null }> = [];
  const lunchPairs: Array<{ start: string; end: string; minutes: number; start_event_id?: string | null; end_event_id?: string | null }> = [];
  const warnings: RestParseWarning[] = [];
  const seen = new Set<string>();

  for (const event of [...args.events].sort((a,b)=>String(a.timestamp ?? '').localeCompare(String(b.timestamp ?? '')))) {
    const eventType = String(event.event_type ?? '').toLowerCase();
    if (!event.timestamp) continue;
    const eventTs = clampIso(event.timestamp, args.shiftStart, args.shiftEnd);
    const dedupeKey = `${eventType}|${eventTs}|${event.id ?? ''}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    if (eventType === 'break_start') {
      if (activeLunchStart) warnings.push({ code: 'overlapping_rest_events', message: 'Regular break started while lunch was open.', event_id: event.id, event_type: eventType });
      if (activeBreakStart) warnings.push({ code: 'unclosed_break', message: 'Previous regular break was not closed before another break started.', event_id: event.id, event_type: eventType });
      activeBreakStart = { ts: eventTs, id: event.id };
    } else if (eventType === 'break_end') {
      if (!activeBreakStart) { warnings.push({ code: 'unclosed_break', message: 'Regular break end has no matching break start.', event_id: event.id, event_type: eventType }); continue; }
      breakPairs.push({ start: activeBreakStart.ts, end: eventTs, minutes: dateDiffMinutes(activeBreakStart.ts, eventTs), start_event_id: activeBreakStart.id, end_event_id: event.id });
      activeBreakStart = null;
    } else if (eventType === 'lunch_start') {
      if (activeBreakStart) warnings.push({ code: 'overlapping_rest_events', message: 'Lunch started while a regular break was open.', event_id: event.id, event_type: eventType });
      if (activeLunchStart) warnings.push({ code: 'unclosed_lunch', message: 'Previous lunch was not closed before another lunch started.', event_id: event.id, event_type: eventType });
      activeLunchStart = { ts: eventTs, id: event.id };
    } else if (eventType === 'lunch_end') {
      if (!activeLunchStart) { warnings.push({ code: 'unclosed_lunch', message: 'Lunch end has no matching lunch start.', event_id: event.id, event_type: eventType }); continue; }
      lunchPairs.push({ start: activeLunchStart.ts, end: eventTs, minutes: dateDiffMinutes(activeLunchStart.ts, eventTs), start_event_id: activeLunchStart.id, end_event_id: event.id });
      activeLunchStart = null;
    }
  }

  if (activeBreakStart) {
    breakPairs.push({ start: activeBreakStart.ts, end: args.shiftEnd, minutes: dateDiffMinutes(activeBreakStart.ts, args.shiftEnd), start_event_id: activeBreakStart.id, end_event_id: 'auto_closed_shift_end' });
    warnings.push({ code: 'unclosed_break', message: 'Regular break was auto-closed at shift end.', event_id: activeBreakStart.id, event_type: 'break_start' });
  }
  if (activeLunchStart) {
    lunchPairs.push({ start: activeLunchStart.ts, end: args.shiftEnd, minutes: dateDiffMinutes(activeLunchStart.ts, args.shiftEnd), start_event_id: activeLunchStart.id, end_event_id: 'auto_closed_shift_end' });
    warnings.push({ code: 'unclosed_lunch', message: 'Lunch was auto-closed at shift end.', event_id: activeLunchStart.id, event_type: 'lunch_start' });
  }

  const regularBreakMinutes = breakPairs.reduce((a,p)=>a+p.minutes,0);
  const lunchMinutes = lunchPairs.reduce((a,p)=>a+p.minutes,0);
  const paidBreakMinutes = args.policy.breaks_are_paid ? regularBreakMinutes : (args.policy.lunch_is_paid ? lunchMinutes : 0);
  const unpaidBreakMinutes = (args.policy.breaks_are_paid ? 0 : regularBreakMinutes) + (args.policy.lunch_is_paid ? 0 : lunchMinutes);

  return { breakPairs, lunchPairs, warnings, regularBreakMinutes, lunchMinutes, paidBreakMinutes, unpaidBreakMinutes };
}

function clampIso(iso: string, minIso: string, maxIso: string): string {
  const v = new Date(iso).getTime();
  const min = new Date(minIso).getTime();
  const max = new Date(maxIso).getTime();
  if (!Number.isFinite(v) || !Number.isFinite(min) || !Number.isFinite(max)) return iso;
  if (v < min) return minIso;
  if (v > max) return maxIso;
  return iso;
}

export async function getOrCreateCurrentPeriod(shopId: string, actorId: string) {
  const admin = createAdminSupabase() as any;
  const today = new Date();

  const { data: shop } = await admin.from("shops").select("timezone").eq("id", shopId).maybeSingle();
  const timezone = shop?.timezone ?? "UTC";

  const { data: settings } = await admin
    .from("shop_payroll_settings")
    .select("*")
    .eq("shop_id", shopId)
    .maybeSingle();

  let payrollSettings = settings;
  if (!payrollSettings) {
    const inserted = await admin
      .from("shop_payroll_settings")
      .insert({ shop_id: shopId, cadence: "biweekly" })
      .select("*")
      .single();
    payrollSettings = inserted.data;
  }

  const cadence = (payrollSettings?.cadence ?? "biweekly") as PayrollCadence;
  const weekStartsOn = Number(payrollSettings?.week_starts_on ?? 1);
  const todayUtc = startOfUtcDay(`${toShopDate(today.toISOString(), timezone)}T00:00:00.000Z`);
  const { start: periodStart, end: periodEnd } = calculatePayPeriodBounds({
    shopDate: todayUtc,
    cadence,
    weekStartsOn,
    anchorDate: payrollSettings?.period_anchor_date ?? null,
  });

  const periodStartIso = toIsoDate(periodStart);
  const periodEndIso = toIsoDate(periodEnd);

  const existing = await admin
    .from("payroll_pay_periods")
    .select("*")
    .eq("shop_id", shopId)
    .eq("period_start", periodStartIso)
    .eq("period_end", periodEndIso)
    .maybeSingle();

  if (existing.data) return { settings: payrollSettings, period: existing.data };

  const created = await admin
    .from("payroll_pay_periods")
    .insert({
      shop_id: shopId,
      period_start: periodStartIso,
      period_end: periodEndIso,
      status: "open",
      notes: `Auto-created by ${actorId}`,
    })
    .select("*")
    .single();

  return { settings: payrollSettings, period: created.data };
}

async function getPeriodSourceState(admin: any, shopId: string, period: any, timezone: string) {
  const rangeStart = localDateToUtcBoundary(period.period_start, timezone);
  const rangeEnd = localDateToUtcBoundary(toIsoDate(addDays(startOfUtcDay(`${period.period_end}T00:00:00.000Z`), 1)), timezone);
  const [{ data: shifts }, { data: jobs }, { data: credits }, { data: settings }, { count: entriesCount }] = await Promise.all([
    admin.from("tech_shifts").select("id, start_time, end_time, created_at").eq("shop_id", shopId).neq("excluded_from_payroll", true).lt("start_time", rangeEnd).or(`end_time.is.null,end_time.gt.${rangeStart}`),
    admin.from("work_order_line_labor_segments").select("id, started_at, ended_at, updated_at, created_at").eq("shop_id", shopId).lt("started_at", rangeEnd).or(`ended_at.is.null,ended_at.gt.${rangeStart}`),
    admin.from("work_order_line_flat_rate_credits").select("id, credited_at, updated_at, created_at").eq("shop_id", shopId).gte("credited_at", rangeStart).lt("credited_at", rangeEnd),
    admin.from("shop_payroll_settings").select("updated_at").eq("shop_id", shopId).maybeSingle(),
    admin.from("payroll_time_entries").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("period_id", period.id),
  ]);
  const shiftIds = (shifts ?? []).map((s: any) => s.id).filter(Boolean);
  const { data: punches } = shiftIds.length
    ? await admin.from("punch_events").select("id, timestamp, created_at").in("shift_id", shiftIds)
    : { data: [] };
  const candidates = [
    period.created_at,
    settings?.updated_at,
    ...(shifts ?? []).flatMap((s: any) => [s.created_at, s.start_time, s.end_time]),
    ...(jobs ?? []).flatMap((j: any) => [j.created_at, j.updated_at, j.started_at, j.ended_at]),
    ...(credits ?? []).flatMap((credit: any) => [credit.created_at, credit.updated_at, credit.credited_at]),
    ...(punches ?? []).flatMap((p: any) => [p.created_at, p.timestamp]),
  ].filter(Boolean).map((v) => new Date(v).getTime()).filter(Number.isFinite);
  return {
    entriesCount: entriesCount ?? 0,
    sourceCount: (shifts?.length ?? 0) + (jobs?.length ?? 0) + (credits?.length ?? 0),
    sourceFreshAt: candidates.length ? new Date(Math.max(...candidates)).toISOString() : null,
    hasOpenTime: (shifts ?? []).some((shift: any) => !shift.end_time) || (jobs ?? []).some((job: any) => !job.ended_at),
    rangeStart,
    rangeEnd,
  };
}

export async function refreshOpenPeriodIfStale(params: { shopId: string; actorId: string; periodId: string }) {
  const admin = createAdminSupabase() as any;
  const { data: period, error } = await admin.from("payroll_pay_periods").select("*").eq("shop_id", params.shopId).eq("id", params.periodId).maybeSingle();
  if (error || !period) throw new Error(error?.message ?? "Pay period not found");
  if (!["draft", "open"].includes(String(period.status))) {
    return { refreshed: false, reason: "locked", hasSourceTime: false, refreshError: null };
  }
  const { data: shop } = await admin.from("shops").select("timezone").eq("id", params.shopId).maybeSingle();
  const state = await getPeriodSourceState(admin, params.shopId, period, shop?.timezone ?? "UTC");
  const periodUpdated = period.updated_at ? new Date(period.updated_at).getTime() : 0;
  const sourceUpdated = state.sourceFreshAt ? new Date(state.sourceFreshAt).getTime() : 0;
  if (state.entriesCount === 0 || sourceUpdated > periodUpdated || state.hasOpenTime) {
    try {
      await rebuildPeriod(params);
      return { refreshed: true, reason: state.hasOpenTime ? "live" : state.entriesCount === 0 ? "empty" : "stale", hasSourceTime: state.sourceCount > 0, refreshError: null };
    } catch (err) {
      console.error("payroll open-period auto-refresh failed", err);
      return { refreshed: false, reason: "refresh_failed", hasSourceTime: state.sourceCount > 0, refreshError: err instanceof Error ? err.message : "Payroll refresh failed" };
    }
  }
  return { refreshed: false, reason: "fresh", hasSourceTime: state.sourceCount > 0, refreshError: null };
}

export async function rebuildPeriod(params: { shopId: string; actorId: string; periodId: string }) {
  const { shopId, periodId } = params;
  const admin = createAdminSupabase() as any;

  const { data: period, error: periodErr } = await admin
    .from("payroll_pay_periods")
    .select("*")
    .eq("id", periodId)
    .eq("shop_id", shopId)
    .single();

  if (periodErr || !period) throw new Error(periodErr?.message ?? "Pay period not found");
  if (period.status === "approved" || period.status === "exported") {
    throw new Error("Approved/exported periods are locked");
  }

  const { data: settings } = await admin
    .from("shop_payroll_settings")
    .select("*")
    .eq("shop_id", shopId)
    .maybeSingle();

  const policy = resolvePayrollPolicy(settings);
  const dailyOvertimeAfter = policy.daily_overtime_after_minutes;
  const weeklyOvertimeAfter = Math.max(0, Number(settings?.weekly_overtime_after_minutes ?? 2400));
  const weekStartsOn = Math.min(6, Math.max(0, Number(settings?.week_starts_on ?? 1)));
  const suspiciousShiftMinutes = policy.suspicious_shift_minutes;

  const { data: shop } = await admin.from("shops").select("timezone").eq("id", shopId).maybeSingle();
  const timezone = shop?.timezone ?? "UTC";
  const rangeStart = localDateToUtcBoundary(period.period_start, timezone);
  const rangeEnd = localDateToUtcBoundary(toIsoDate(addDays(startOfUtcDay(`${period.period_end}T00:00:00.000Z`), 1)), timezone);

  const [
    { data: shifts, error: shiftsErr },
    { data: jobSegments, error: jobsErr },
    { data: flatRateCredits, error: creditsErr },
  ] = await Promise.all([
    admin
      .from("tech_shifts")
      .select("id, user_id, type, status, start_time, end_time, excluded_from_payroll")
      .eq("shop_id", shopId)
      .neq("excluded_from_payroll", true)
      .lt("start_time", rangeEnd)
      .or(`end_time.is.null,end_time.gt.${rangeStart}`),
    admin
      .from("work_order_line_labor_segments")
      .select("id, technician_id, started_at, ended_at")
      .eq("shop_id", shopId)
      .lt("started_at", rangeEnd)
      .or(`ended_at.is.null,ended_at.gt.${rangeStart}`),
    admin
      .from("work_order_line_flat_rate_credits")
      .select("id, technician_id, credit_hours, credited_at")
      .eq("shop_id", shopId)
      .gte("credited_at", rangeStart)
      .lt("credited_at", rangeEnd),
  ]);

  if (shiftsErr) throw new Error(shiftsErr.message);
  if (jobsErr) throw new Error(jobsErr.message);
  if (creditsErr) throw new Error(creditsErr.message);

  const shiftIds = (shifts ?? []).map((s: { id: string }) => s.id).filter(Boolean);
  const { data: punchEvents, error: punchEventsErr } = shiftIds.length
    ? await admin
        .from("punch_events")
        .select("id, shift_id, event_type, timestamp")
        .in("shift_id", shiftIds)
        .order("timestamp", { ascending: true })
    : { data: [], error: null };

  if (punchEventsErr) throw new Error(punchEventsErr.message);

  const punchEventsByShift = new Map<
    string,
    Array<{ id?: string | null; event_type: string | null; timestamp: string | null }>
  >();
  for (const event of punchEvents ?? []) {
    const sid = event.shift_id as string | null;
    if (!sid) continue;
    const current = punchEventsByShift.get(sid) ?? [];
    current.push({
      id: (event.id as string | null) ?? null,
      event_type: (event.event_type as string | null) ?? null,
      timestamp: (event.timestamp as string | null) ?? null,
    });
    punchEventsByShift.set(sid, current);
  }

  const rowsByKey = new Map<string, {
    user_id: string;
    work_date: string;
    attendance_minutes: number;
    unpaid_break_minutes: number;
    paid_break_minutes: number;
    job_minutes: number;
    flagged_minutes: number;
    warnings: number;
    blocking: number;
    source_snapshot: Record<string, unknown>;
  }>();

  const exceptions: PayrollException[] = [];

  const newRow = (userId: string, workDate: string) => ({
    user_id: userId,
    work_date: workDate,
    attendance_minutes: 0,
    unpaid_break_minutes: 0,
    paid_break_minutes: 0,
    job_minutes: 0,
    flagged_minutes: 0,
    warnings: 0,
    blocking: 0,
    source_snapshot: { shift_ids: [], open_shift_ids: [], shifts: [], job_segment_ids: [] } as Record<string, unknown>,
  });
  const getRow = (userId: string, workDate: string) => {
    const key = `${userId}:${workDate}`;
    const row = rowsByKey.get(key) ?? newRow(userId, workDate);
    rowsByKey.set(key, row);
    return row;
  };
  const pushException = (row: ReturnType<typeof newRow>, item: Omit<PayrollException, "user_id" | "work_date">) => {
    if (item.severity === "blocking") row.blocking += 1;
    else row.warnings += 1;
    exceptions.push({ ...item, user_id: row.user_id, work_date: row.work_date });
  };

  for (const shift of shifts ?? []) {
    if (!shift.user_id || !shift.start_time) continue;
    const endTime = shift.end_time ?? new Date().toISOString();
    const duration = dateDiffMinutes(shift.start_time, endTime);
    const slices = splitIntervalByShopDay({
      start: shift.start_time,
      end: endTime,
      timezone,
      rangeStart,
      rangeEnd,
    });
    if (slices.length === 0) continue;

    const events = punchEventsByShift.get(shift.id) ?? [];
    const rest = parsePayrollRestEvents({ events, shiftStart: shift.start_time, shiftEnd: endTime, policy });

    for (const slice of slices) {
      const row = getRow(shift.user_id, slice.workDate);
      row.attendance_minutes += slice.minutes;

      const regularBreakMinutes = overlapPairMinutes(rest.breakPairs, slice.start, slice.end);
      const lunchMinutes = overlapPairMinutes(rest.lunchPairs, slice.start, slice.end);
      row.paid_break_minutes +=
        (policy.breaks_are_paid ? regularBreakMinutes : 0) +
        (policy.lunch_is_paid ? lunchMinutes : 0);
      row.unpaid_break_minutes +=
        (policy.breaks_are_paid ? 0 : regularBreakMinutes) +
        (policy.lunch_is_paid ? 0 : lunchMinutes);

      const shiftIds = Array.isArray(row.source_snapshot.shift_ids)
        ? row.source_snapshot.shift_ids as string[]
        : [];
      if (!shiftIds.includes(shift.id)) shiftIds.push(shift.id);
      row.source_snapshot.shift_ids = shiftIds;

      const summaries = Array.isArray(row.source_snapshot.shifts)
        ? row.source_snapshot.shifts as Array<Record<string, unknown>>
        : [];
      summaries.push({
        id: shift.id,
        start_time: shift.start_time,
        end_time: shift.end_time,
        status: shift.status,
        slice_start: slice.start,
        slice_end: slice.end,
        slice_minutes: slice.minutes,
      });
      row.source_snapshot.shifts = summaries;
      row.source_snapshot.policy_snapshot = policy;
      row.source_snapshot.break_source = events.length > 0 ? "punch_events" : "none_recorded";
      row.source_snapshot.punch_event_count = events.length;
      row.source_snapshot.paid_break_minutes = row.paid_break_minutes;
      row.source_snapshot.unpaid_break_minutes = row.unpaid_break_minutes;

      const sliceBreakCount = rest.breakPairs.filter((pair) =>
        new Date(pair.start) < new Date(slice.end) && new Date(pair.end) > new Date(slice.start),
      ).length;
      const sliceLunchCount = rest.lunchPairs.filter((pair) =>
        new Date(pair.start) < new Date(slice.end) && new Date(pair.end) > new Date(slice.start),
      ).length;
      if (slice.minutes >= policy.lunch_required_after_minutes && sliceLunchCount === 0) {
        pushException(row, {
          severity: "warning",
          code: "missing_lunch",
          message: `Attendance exceeded ${policy.lunch_required_after_minutes} minutes with no lunch punch.`,
          source_type: "attendance",
          source_ref: { shift_id: shift.id, slice_start: slice.start, slice_end: slice.end },
        });
      }
      if (sliceBreakCount > policy.paid_breaks_per_day) {
        pushException(row, {
          severity: "warning",
          code: "excess_break_count",
          message: `Recorded ${sliceBreakCount} regular breaks; policy expects ${policy.paid_breaks_per_day}.`,
          source_type: "attendance",
          source_ref: { shift_id: shift.id, break_count: sliceBreakCount, expected_breaks: policy.paid_breaks_per_day },
        });
      }
      if (slice.minutes >= policy.lunch_required_after_minutes && sliceBreakCount < policy.paid_breaks_per_day) {
        pushException(row, {
          severity: "warning",
          code: "missing_expected_break",
          message: `Recorded ${sliceBreakCount} regular breaks; policy expects ${policy.paid_breaks_per_day}.`,
          source_type: "attendance",
          source_ref: { shift_id: shift.id, break_count: sliceBreakCount, expected_breaks: policy.paid_breaks_per_day },
        });
      }
    }

    const warningRow = getRow(shift.user_id, slices[slices.length - 1].workDate);
    for (const warning of rest.warnings) {
      pushException(warningRow, {
        severity: "warning",
        code: warning.code,
        message: warning.message,
        source_type: "attendance",
        source_ref: { shift_id: shift.id, ...warning },
      });
    }
    const longLunchThreshold = policy.default_lunch_duration_minutes + 15;
    for (const lunch of rest.lunchPairs) {
      if (lunch.minutes > longLunchThreshold) {
        pushException(warningRow, {
          severity: "warning",
          code: "long_lunch",
          message: `Lunch length ${lunch.minutes} minutes exceeds expected ${policy.default_lunch_duration_minutes} minutes.`,
          source_type: "attendance",
          source_ref: { shift_id: shift.id, lunch },
        });
      }
    }

    if (!shift.end_time) {
      const openIds = Array.isArray(warningRow.source_snapshot.open_shift_ids)
        ? warningRow.source_snapshot.open_shift_ids as string[]
        : [];
      if (!openIds.includes(shift.id)) openIds.push(shift.id);
      warningRow.source_snapshot.open_shift_ids = openIds;
      pushException(warningRow, {
        severity: "blocking",
        code: "open_shift",
        message: "Shift is still open. Review the live duration before approving payroll.",
        source_type: "attendance",
        source_ref: { shift_id: shift.id, start_time: shift.start_time, current_duration_minutes: duration },
      });
    }

    if (duration > suspiciousShiftMinutes) {
      pushException(warningRow, {
        severity: "warning",
        code: "suspicious_shift",
        message: `Shift length ${duration} minutes exceeds threshold ${suspiciousShiftMinutes}.`,
        source_type: "attendance",
        source_ref: { shift_id: shift.id, duration },
      });
    }

    if (duration <= 0) {
      pushException(warningRow, {
        severity: "blocking",
        code: "invalid_duration",
        message: "Shift duration is invalid or negative.",
        source_type: "attendance",
        source_ref: { shift_id: shift.id },
      });
    }
  }

  for (const seg of jobSegments ?? []) {
    if (!seg.technician_id || !seg.started_at) continue;
    const segmentEnd = seg.ended_at ?? new Date().toISOString();
    const slices = splitIntervalByShopDay({
      start: seg.started_at,
      end: segmentEnd,
      timezone,
      rangeStart,
      rangeEnd,
    });
    if (slices.length === 0) continue;

    for (const slice of slices) {
      const row = getRow(seg.technician_id, slice.workDate);
      row.job_minutes += slice.minutes;
      const segIds = Array.isArray(row.source_snapshot.job_segment_ids)
        ? row.source_snapshot.job_segment_ids as string[]
        : [];
      if (!segIds.includes(seg.id)) segIds.push(seg.id);
      row.source_snapshot.job_segment_ids = segIds;
    }

    if (!seg.ended_at) {
      const row = getRow(seg.technician_id, slices[slices.length - 1].workDate);
      pushException(row, {
        severity: "warning",
        code: "open_job_segment",
        message: "Job segment is still active and is included through the current time.",
        source_type: "job_time",
        source_ref: { segment_id: seg.id, started_at: seg.started_at },
      });
    }
  }

  for (const credit of flatRateCredits ?? []) {
    if (!credit.technician_id || !credit.credited_at) continue;
    const workDate = toShopDate(credit.credited_at, timezone);
    if (workDate < period.period_start || workDate > period.period_end) continue;
    const row = getRow(credit.technician_id, workDate);
    row.flagged_minutes += Math.max(0, Math.round(Number(credit.credit_hours ?? 0) * MINUTES_IN_HOUR));
    const creditIds = Array.isArray(row.source_snapshot.flat_rate_credit_ids)
      ? row.source_snapshot.flat_rate_credit_ids as string[]
      : [];
    if (credit.id && !creditIds.includes(credit.id)) creditIds.push(credit.id);
    row.source_snapshot.flat_rate_credit_ids = creditIds;
  }

  const { data: existingEntries } = await admin.from("payroll_time_entries").select("user_id, work_date, adjustment_minutes, approval_state").eq("shop_id", shopId).eq("period_id", periodId);
  const adjustmentByKey = new Map((existingEntries ?? []).map((e: any) => [`${e.user_id}:${e.work_date}`, Number(e.adjustment_minutes ?? 0)]));
  for (const row of rowsByKey.values()) { (row.source_snapshot as any).preserved_adjustment_minutes = adjustmentByKey.get(`${row.user_id}:${row.work_date}`) ?? 0; }

  const dailyRows = Array.from(rowsByKey.values()).map((row) => {
    if (row.job_minutes > row.attendance_minutes - row.unpaid_break_minutes) {
      row.warnings += 1;
      exceptions.push({ user_id: row.user_id, work_date: row.work_date, severity: "warning", code: "job_time_exceeds_worked_time", message: "Productive job time exceeds payroll worked time.", source_type: "job_time", source_ref: { job_minutes: row.job_minutes, worked_minutes: row.attendance_minutes - row.unpaid_break_minutes } });
    }
    if (row.attendance_minutes > 0 && row.job_minutes === 0) {
      row.warnings += 1;
      exceptions.push({ user_id: row.user_id, work_date: row.work_date, severity: "warning", code: "attendance_without_job_time", message: "Attendance was recorded with no completed job labor segments.", source_type: "job_time", source_ref: { attendance_minutes: row.attendance_minutes } });
    }
    const adjustment = Number((row.source_snapshot as any).preserved_adjustment_minutes ?? 0);
    const netWorked = Math.max(0, row.attendance_minutes - row.unpaid_break_minutes + adjustment);
    const overtime = Math.max(0, netWorked - dailyOvertimeAfter);
    const regular = Math.max(0, netWorked - overtime);

    return {
      shop_id: shopId,
      period_id: periodId,
      user_id: row.user_id,
      work_date: row.work_date,
      worked_minutes: netWorked,
      attendance_minutes: row.attendance_minutes,
      unpaid_break_minutes: row.unpaid_break_minutes,
      paid_break_minutes: row.paid_break_minutes,
      regular_minutes: regular,
      overtime_minutes: overtime,
      job_minutes: row.job_minutes,
      flagged_minutes: row.flagged_minutes,
      adjustment_minutes: adjustment,
      has_exceptions: row.warnings + row.blocking > 0,
      warning_exception_count: row.warnings,
      blocking_exception_count: row.blocking,
      approval_state: "draft",
      source_snapshot: row.source_snapshot,
    };
  });

  const upserts = applyWeeklyOvertime(dailyRows, weeklyOvertimeAfter, weekStartsOn);
  const { data: replaced, error: replaceErr } = await admin.rpc("replace_payroll_period_snapshot", {
    p_shop_id: shopId,
    p_actor_profile_id: params.actorId,
    p_period_id: periodId,
    p_entries: upserts,
    p_exceptions: exceptions,
  });
  if (replaceErr) throw new Error(replaceErr.message);

  return {
    rows: Number(replaced?.rows ?? upserts.length),
    exceptions: Number(replaced?.exceptions ?? exceptions.length),
  };
}

export async function approvePeriod(params: { shopId: string; periodId: string; actorId: string }) {
  const admin = createAdminSupabase() as any;
  const { shopId, periodId, actorId } = params;

  const { count: blockingCount, error: blockingErr } = await admin
    .from("payroll_time_exceptions")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId)
    .eq("period_id", periodId)
    .eq("severity", "blocking")
    .eq("resolved", false);

  if (blockingErr) throw new Error(blockingErr.message);
  if ((blockingCount ?? 0) > 0) {
    throw new Error("Cannot approve period with unresolved blocking exceptions.");
  }

  const now = new Date().toISOString();
  const { error: entriesErr } = await admin
    .from("payroll_time_entries")
    .update({ approval_state: "approved", approved_at: now, approved_by: actorId })
    .eq("shop_id", shopId)
    .eq("period_id", periodId);

  if (entriesErr) throw new Error(entriesErr.message);

  const { error: periodErr } = await admin
    .from("payroll_pay_periods")
    .update({ status: "approved", approved_at: now, approved_by: actorId, locked_at: now, updated_at: now })
    .eq("id", periodId)
    .eq("shop_id", shopId);

  if (periodErr) throw new Error(periodErr.message);
}

export async function exportPeriod(params: { shopId: string; periodId: string; actorId: string; providerType?: string }) {
  const admin = createAdminSupabase() as any;
  const { shopId, periodId, actorId } = params;
  const providerType = params.providerType ?? "csv";

  const { data: period, error: periodErr } = await admin
    .from("payroll_pay_periods")
    .select("id, status")
    .eq("id", periodId)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (periodErr) throw new Error(periodErr.message);
  if (!period?.id) {
    throw new PayrollExportError("Payroll period not found.", 404);
  }
  if (period.status !== "approved") {
    throw new PayrollExportError("Payroll period must be approved before export.", 409);
  }

  const { count: unresolvedBlockingCount, error: blockingErr } = await admin
    .from("payroll_time_exceptions")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId)
    .eq("period_id", periodId)
    .eq("severity", "blocking")
    .eq("resolved", false);

  if (blockingErr) throw new Error(blockingErr.message);
  if ((unresolvedBlockingCount ?? 0) > 0) {
    throw new PayrollExportError("Resolve blocking payroll exceptions before export.", 409);
  }

  const { data: entries, error: entriesErr } = await admin
    .from("payroll_time_entries")
    .select("user_id, regular_minutes, overtime_minutes, unpaid_break_minutes, worked_minutes")
    .eq("shop_id", shopId)
    .eq("period_id", periodId)
    .order("user_id", { ascending: true });

  if (entriesErr) throw new Error(entriesErr.message);

  const { data: mappings } = await admin
    .from("payroll_employee_mappings")
    .select("user_id, external_employee_id")
    .eq("shop_id", shopId)
    .eq("provider_type", providerType);

  const mappingByUser = new Map<string, string | null>((mappings ?? []).map((m: any) => [m.user_id, m.external_employee_id ?? null]));

  const grouped = new Map<string, { regular: number; overtime: number; unpaidBreak: number; worked: number }>();
  for (const e of entries ?? []) {
    const agg = grouped.get(e.user_id) ?? { regular: 0, overtime: 0, unpaidBreak: 0, worked: 0 };
    agg.regular += Number(e.regular_minutes ?? 0);
    agg.overtime += Number(e.overtime_minutes ?? 0);
    agg.unpaidBreak += Number(e.unpaid_break_minutes ?? 0);
    agg.worked += Number(e.worked_minutes ?? 0);
    grouped.set(e.user_id, agg);
  }

  const { data: batch, error: batchErr } = await admin
    .from("payroll_export_batches")
    .insert({
      shop_id: shopId,
      period_id: periodId,
      provider_type: providerType,
      status: "generated",
      exported_by: actorId,
      exported_at: new Date().toISOString(),
      row_count: grouped.size,
      payload: { generated_from: "payroll_time_entries" },
    })
    .select("id")
    .single();

  if (batchErr || !batch?.id) throw new Error(batchErr?.message ?? "Failed to create export batch");

  const rows = Array.from(grouped.entries()).map(([userId, agg]) => ({
    shop_id: shopId,
    batch_id: batch.id,
    period_id: periodId,
    user_id: userId,
    employee_external_id: mappingByUser.get(userId) ?? null,
    regular_hours: Number((agg.regular / MINUTES_IN_HOUR).toFixed(2)),
    overtime_hours: Number((agg.overtime / MINUTES_IN_HOUR).toFixed(2)),
    unpaid_break_hours: Number((agg.unpaidBreak / MINUTES_IN_HOUR).toFixed(2)),
    total_hours: Number((agg.worked / MINUTES_IN_HOUR).toFixed(2)),
    row_payload: { source: "period_snapshot" },
  }));

  if (rows.length > 0) {
    const { error: rowsErr } = await admin.from("payroll_export_rows").insert(rows);
    if (rowsErr) throw new Error(rowsErr.message);
  }

  const csvHeaders = ["user_id", "employee_external_id", "regular_hours", "overtime_hours", "unpaid_break_hours", "total_hours"];
  const csvLines = [
    csvHeaders.join(","),
    ...rows.map((r) => [r.user_id, r.employee_external_id ?? "", r.regular_hours, r.overtime_hours, r.unpaid_break_hours, r.total_hours].join(",")),
  ];
  const csv = csvLines.join("\n");

  const storageBucket = "payroll-exports";
  const storagePath = `${shopId}/${periodId}/${batch.id}.csv`;
  const fileSizeBytes = Buffer.byteLength(csv, "utf8");
  const fileSha256 = createHash("sha256").update(csv, "utf8").digest("hex");

  const { error: uploadErr } = await admin.storage
    .from(storageBucket)
    .upload(storagePath, csv, { contentType: "text/csv; charset=utf-8", upsert: false });

  if (uploadErr) {
    await admin
      .from("payroll_export_batches")
      .update({ handoff_status: "failed", updated_at: new Date().toISOString() })
      .eq("id", batch.id)
      .eq("shop_id", shopId);
    throw new Error(`Failed to persist payroll export artifact: ${uploadErr.message}`);
  }

  const { error: batchMetaErr } = await admin
    .from("payroll_export_batches")
    .update({
      storage_bucket: storageBucket,
      storage_path: storagePath,
      file_size_bytes: fileSizeBytes,
      file_sha256: fileSha256,
      provider_template_version: "generic-v1",
      handoff_status: "generated",
      updated_at: new Date().toISOString(),
    })
    .eq("id", batch.id)
    .eq("shop_id", shopId);

  if (batchMetaErr) {
    await admin
      .from("payroll_export_batches")
      .update({ handoff_status: "failed", updated_at: new Date().toISOString() })
      .eq("id", batch.id)
      .eq("shop_id", shopId);
    throw new Error(`Failed to save payroll export artifact metadata: ${batchMetaErr.message}`);
  }

  const now = new Date().toISOString();
  await admin
    .from("payroll_pay_periods")
    .update({ status: "exported", exported_at: now, exported_by: actorId, locked_at: now, updated_at: now })
    .eq("id", periodId)
    .eq("shop_id", shopId);

  void admin.from("audit_logs").insert({
    shop_id: shopId,
    actor_id: actorId,
    action: "payroll.export.generated",
    target_table: "payroll_export_batches",
    target_id: batch.id,
    metadata: {
      shop_id: shopId,
      period_id: periodId,
      batch_id: batch.id,
      provider_type: providerType,
      row_count: rows.length,
      has_artifact: true,
      file_sha256: fileSha256,
      file_size_bytes: fileSizeBytes,
    },
  });

  return { batchId: batch.id, rowCount: rows.length, csv };
}
