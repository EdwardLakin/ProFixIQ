import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { createHash } from "crypto";
import { shopLocalDateTimeToUtc } from "@/features/shared/lib/utils/shopDayWindow";
import {
  buildPayrollPeriodRanges,
  calculatePayPeriodBounds,
  DEFAULT_BIWEEKLY_ANCHOR_DATE,
  type PayrollCadence,
} from "@/features/payroll-time/lib/payPeriodBounds";
import { applyWeeklyOvertime } from "@/features/payroll-time/lib/overtime";
import { workforceDisplayName } from "@/features/workforce/lib/roster";

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
const PAYROLL_EXPORT_PROVIDERS = new Set([
  "csv",
  "wagepoint",
  "payworks",
  "dayforce",
  "generic",
]);

export function escapePayrollCsvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

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
  return shopLocalDateTimeToUtc(dateKey, "00:00:00", timezone);
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

export type DailyRestPolicyFinding = {
  code: "missing_lunch" | "excess_break_count" | "missing_expected_break";
  message: string;
};

export function evaluateDailyRestPolicy(args: {
  attendanceMinutes: number;
  regularBreakCount: number;
  lunchCount: number;
  policy: PayrollPolicySnapshot;
}): DailyRestPolicyFinding[] {
  const findings: DailyRestPolicyFinding[] = [];
  const requiresDailyRestReview =
    args.attendanceMinutes >= args.policy.lunch_required_after_minutes;

  if (requiresDailyRestReview && args.lunchCount === 0) {
    findings.push({
      code: "missing_lunch",
      message: `Attendance exceeded ${args.policy.lunch_required_after_minutes} minutes with no lunch punch.`,
    });
  }
  if (args.regularBreakCount > args.policy.paid_breaks_per_day) {
    findings.push({
      code: "excess_break_count",
      message: `Recorded ${args.regularBreakCount} regular breaks; policy expects ${args.policy.paid_breaks_per_day}.`,
    });
  }
  if (
    requiresDailyRestReview &&
    args.regularBreakCount < args.policy.paid_breaks_per_day
  ) {
    findings.push({
      code: "missing_expected_break",
      message: `Recorded ${args.regularBreakCount} regular breaks; policy expects ${args.policy.paid_breaks_per_day}.`,
    });
  }

  return findings;
}

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
  const paidBreakMinutes =
    (args.policy.breaks_are_paid ? regularBreakMinutes : 0) +
    (args.policy.lunch_is_paid ? lunchMinutes : 0);
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

async function getEarliestPayrollSourceDate(
  admin: any,
  shopId: string,
  timezone: string,
): Promise<string | null> {
  const [shiftResult, jobResult, creditResult] = await Promise.all([
    admin
      .from("tech_shifts")
      .select("start_time")
      .eq("shop_id", shopId)
      .neq("excluded_from_payroll", true)
      .order("start_time", { ascending: true })
      .limit(1)
      .maybeSingle(),
    admin
      .from("work_order_line_labor_segments")
      .select("started_at")
      .eq("shop_id", shopId)
      .order("started_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    admin
      .from("work_order_line_flat_rate_credits")
      .select("credited_at")
      .eq("shop_id", shopId)
      .order("credited_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  const sourceError =
    shiftResult.error ?? jobResult.error ?? creditResult.error;
  if (sourceError) throw new Error(sourceError.message);

  const timestamps = [
    shiftResult.data?.start_time,
    jobResult.data?.started_at,
    creditResult.data?.credited_at,
  ]
    .filter((value): value is string => typeof value === "string")
    .map((value) => ({ value, timestamp: new Date(value).getTime() }))
    .filter((value) => Number.isFinite(value.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);

  return timestamps[0] ? toShopDate(timestamps[0].value, timezone) : null;
}

function periodsOverlap(
  left: { periodStart: string; periodEnd: string },
  right: { period_start: string; period_end: string },
) {
  return (
    left.periodStart <= right.period_end &&
    left.periodEnd >= right.period_start
  );
}

export async function getOrCreateCurrentPeriod(shopId: string) {
  const admin = createAdminSupabase() as any;
  const today = new Date();

  const { data: shop, error: shopError } = await admin
    .from("shops")
    .select("timezone")
    .eq("id", shopId)
    .maybeSingle();
  if (shopError) throw new Error(shopError.message);
  if (!shop) throw new Error("Shop not found.");
  const timezone = shop?.timezone ?? "UTC";

  const { data: settings, error: settingsError } = await admin
    .from("shop_payroll_settings")
    .select("*")
    .eq("shop_id", shopId)
    .maybeSingle();
  if (settingsError) throw new Error(settingsError.message);

  let payrollSettings = settings;
  if (!payrollSettings) {
    const inserted = await admin
      .from("shop_payroll_settings")
      .insert({
        shop_id: shopId,
        cadence: "biweekly",
        period_anchor_date: DEFAULT_BIWEEKLY_ANCHOR_DATE,
      })
      .select("*")
      .single();
    if (inserted.error) {
      const concurrent = await admin
        .from("shop_payroll_settings")
        .select("*")
        .eq("shop_id", shopId)
        .maybeSingle();
      if (concurrent.error || !concurrent.data) {
        throw new Error(inserted.error.message);
      }
      payrollSettings = concurrent.data;
    } else {
      payrollSettings = inserted.data;
    }
  } else if (
    payrollSettings.cadence === "biweekly" &&
    !payrollSettings.period_anchor_date
  ) {
    const updated = await admin
      .from("shop_payroll_settings")
      .update({
        period_anchor_date: DEFAULT_BIWEEKLY_ANCHOR_DATE,
        updated_at: new Date().toISOString(),
      })
      .eq("shop_id", shopId)
      .select("*")
      .single();
    if (updated.error) throw new Error(updated.error.message);
    payrollSettings = updated.data ?? payrollSettings;
  }

  const cadence = (payrollSettings?.cadence ?? "biweekly") as PayrollCadence;
  const weekStartsOn = Number(payrollSettings?.week_starts_on ?? 1);
  const currentWorkDate = toShopDate(today.toISOString(), timezone);
  const todayUtc = startOfUtcDay(`${currentWorkDate}T00:00:00.000Z`);
  const { start: periodStart, end: periodEnd } = calculatePayPeriodBounds({
    shopDate: todayUtc,
    cadence,
    weekStartsOn,
    anchorDate: payrollSettings?.period_anchor_date ?? null,
  });

  const periodStartIso = toIsoDate(periodStart);
  const periodEndIso = toIsoDate(periodEnd);

  const { data: existingPeriods, error: existingPeriodsError } = await admin
    .from("payroll_pay_periods")
    .select("id, period_start, period_end, status")
    .eq("shop_id", shopId)
    .order("period_start", { ascending: true });
  if (existingPeriodsError) throw new Error(existingPeriodsError.message);

  const earliestSourceDate = await getEarliestPayrollSourceDate(
    admin,
    shopId,
    timezone,
  );
  const calculatedRanges = buildPayrollPeriodRanges({
    firstWorkDate: earliestSourceDate ?? currentWorkDate,
    currentWorkDate,
    cadence,
    weekStartsOn,
    anchorDate: payrollSettings?.period_anchor_date ?? null,
  });
  const rangesToCreate = calculatedRanges.filter((range) => {
    const isCurrent =
      range.periodStart === periodStartIso && range.periodEnd === periodEndIso;
    const exactPeriodExists = (existingPeriods ?? []).some(
      (period: { period_start: string; period_end: string }) =>
        period.period_start === range.periodStart &&
        period.period_end === range.periodEnd,
    );
    if (exactPeriodExists) return false;
    if (isCurrent) return true;
    return !(existingPeriods ?? []).some(
      (period: { period_start: string; period_end: string }) =>
        periodsOverlap(range, period),
    );
  });

  const periodRows = rangesToCreate.map((range) => ({
    shop_id: shopId,
    period_start: range.periodStart,
    period_end: range.periodEnd,
    start_date: range.periodStart,
    end_date: range.periodEnd,
    processed: false,
    status: "open",
    notes:
      range.periodStart === periodStartIso && range.periodEnd === periodEndIso
        ? "Automatically created by Workforce Payroll."
        : "Automatically created from recorded Workforce time.",
  }));
  if (periodRows.length > 0) {
    const created = await admin
      .from("payroll_pay_periods")
      .upsert(periodRows, {
        onConflict: "shop_id,period_start,period_end",
        ignoreDuplicates: true,
      });
    if (created.error) throw new Error(created.error.message);
  }

  const currentPeriod = await admin
    .from("payroll_pay_periods")
    .select("*")
    .eq("shop_id", shopId)
    .eq("period_start", periodStartIso)
    .eq("period_end", periodEndIso)
    .maybeSingle();
  if (currentPeriod.error) throw new Error(currentPeriod.error.message);
  if (!currentPeriod.data) throw new Error("Current payroll period was not created");

  return { settings: payrollSettings, period: currentPeriod.data };
}

async function getPeriodSourceState(admin: any, shopId: string, period: any, timezone: string) {
  const rangeStart = localDateToUtcBoundary(period.period_start, timezone);
  const rangeEnd = localDateToUtcBoundary(toIsoDate(addDays(startOfUtcDay(`${period.period_end}T00:00:00.000Z`), 1)), timezone);
  const [
    { data: shifts, error: shiftsError },
    { data: jobs, error: jobsError },
    { data: credits, error: creditsError },
    { data: settings, error: settingsError },
    { data: workforceProfiles, error: workforceProfilesError },
    { count: entriesCount, error: entriesError },
  ] = await Promise.all([
    admin.from("tech_shifts").select("id, start_time, end_time, created_at").eq("shop_id", shopId).neq("excluded_from_payroll", true).lt("start_time", rangeEnd).or(`end_time.is.null,end_time.gt.${rangeStart}`),
    admin.from("work_order_line_labor_segments").select("id, started_at, ended_at, updated_at, created_at").eq("shop_id", shopId).lt("started_at", rangeEnd).or(`ended_at.is.null,ended_at.gt.${rangeStart}`),
    admin.from("work_order_line_flat_rate_credits").select("id, credited_at, updated_at, created_at").eq("shop_id", shopId).gte("credited_at", rangeStart).lt("credited_at", rangeEnd),
    admin.from("shop_payroll_settings").select("updated_at").eq("shop_id", shopId).maybeSingle(),
    admin.from("people_workforce_profiles").select("updated_at").eq("shop_id", shopId),
    admin.from("payroll_time_entries").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("period_id", period.id),
  ]);
  const sourceStateError =
    shiftsError ??
    jobsError ??
    creditsError ??
    settingsError ??
    workforceProfilesError ??
    entriesError;
  if (sourceStateError) throw new Error(sourceStateError.message);
  const shiftIds = (shifts ?? []).map((s: any) => s.id).filter(Boolean);
  const { data: punches, error: punchesError } = shiftIds.length
    ? await admin.from("punch_events").select("id, timestamp, created_at").in("shift_id", shiftIds)
    : { data: [], error: null };
  if (punchesError) throw new Error(punchesError.message);
  const candidates = [
    period.created_at,
    settings?.updated_at,
    ...(shifts ?? []).flatMap((s: any) => [s.created_at, s.start_time, s.end_time]),
    ...(jobs ?? []).flatMap((j: any) => [j.created_at, j.updated_at, j.started_at, j.ended_at]),
    ...(credits ?? []).flatMap((credit: any) => [credit.created_at, credit.updated_at, credit.credited_at]),
    ...(workforceProfiles ?? []).map(
      (workforce: { updated_at: string | null }) => workforce.updated_at,
    ),
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
  const { data: shop, error: shopError } = await admin
    .from("shops")
    .select("timezone")
    .eq("id", params.shopId)
    .maybeSingle();
  if (shopError) throw new Error(shopError.message);
  if (!shop) throw new Error("Shop not found.");
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

  const { data: settings, error: settingsError } = await admin
    .from("shop_payroll_settings")
    .select("*")
    .eq("shop_id", shopId)
    .maybeSingle();
  if (settingsError) throw new Error(settingsError.message);

  const policy = resolvePayrollPolicy(settings);
  const dailyOvertimeAfter = policy.daily_overtime_after_minutes;
  const weeklyOvertimeAfter = Math.max(0, Number(settings?.weekly_overtime_after_minutes ?? 2400));
  const weekStartsOn = Math.min(6, Math.max(0, Number(settings?.week_starts_on ?? 1)));
  const suspiciousShiftMinutes = policy.suspicious_shift_minutes;

  const { data: shop, error: shopError } = await admin
    .from("shops")
    .select("timezone")
    .eq("id", shopId)
    .maybeSingle();
  if (shopError) throw new Error(shopError.message);
  if (!shop) throw new Error("Shop not found.");
  const timezone = shop?.timezone ?? "UTC";
  const rangeStart = localDateToUtcBoundary(period.period_start, timezone);
  const rangeEnd = localDateToUtcBoundary(toIsoDate(addDays(startOfUtcDay(`${period.period_end}T00:00:00.000Z`), 1)), timezone);

  const [
    { data: shifts, error: shiftsErr },
    { data: jobSegments, error: jobsErr },
    { data: flatRateCredits, error: creditsErr },
    { data: workforceProfiles, error: workforceProfilesErr },
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
    admin
      .from("people_workforce_profiles")
      .select("user_id, employment_status, payroll_ready")
      .eq("shop_id", shopId),
  ]);

  if (shiftsErr) throw new Error(shiftsErr.message);
  if (jobsErr) throw new Error(jobsErr.message);
  if (creditsErr) throw new Error(creditsErr.message);
  if (workforceProfilesErr) throw new Error(workforceProfilesErr.message);

  const payrollReadyByUser = new Map(
    (workforceProfiles ?? []).map(
      (profile: {
        user_id: string;
        employment_status: string | null;
        payroll_ready: boolean | null;
      }) => [
        profile.user_id,
        profile.employment_status === "active" &&
          profile.payroll_ready === true,
      ],
    ),
  );

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
    source_snapshot: {
      shift_ids: [],
      open_shift_ids: [],
      shifts: [],
      punch_events: [],
      job_segment_ids: [],
    } as Record<string, unknown>,
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
      const storedPunches = Array.isArray(row.source_snapshot.punch_events)
        ? row.source_snapshot.punch_events as Array<{
            id: string | null;
            event_type: string | null;
            timestamp: string | null;
          }>
        : [];
      const storedPunchIds = new Set(
        storedPunches.map((event) => event.id).filter(Boolean),
      );
      for (const event of events) {
        if (
          !event.timestamp ||
          toShopDate(event.timestamp, timezone) !== slice.workDate ||
          (event.id && storedPunchIds.has(event.id))
        ) {
          continue;
        }
        storedPunches.push({
          id: event.id ?? null,
          event_type: event.event_type,
          timestamp: event.timestamp,
        });
        if (event.id) storedPunchIds.add(event.id);
      }
      storedPunches.sort((a, b) =>
        String(a.timestamp ?? "").localeCompare(String(b.timestamp ?? "")),
      );
      row.source_snapshot.punch_events = storedPunches;
      row.source_snapshot.policy_snapshot = policy;
      row.source_snapshot.break_source =
        storedPunches.length > 0 ? "punch_events" : "none_recorded";
      row.source_snapshot.punch_event_count = storedPunches.length;
      row.source_snapshot.paid_break_minutes = row.paid_break_minutes;
      row.source_snapshot.unpaid_break_minutes = row.unpaid_break_minutes;

      const sliceBreakCount = rest.breakPairs.filter((pair) =>
        new Date(pair.start) < new Date(slice.end) && new Date(pair.end) > new Date(slice.start),
      ).length;
      const sliceLunchCount = rest.lunchPairs.filter((pair) =>
        new Date(pair.start) < new Date(slice.end) && new Date(pair.end) > new Date(slice.start),
      ).length;
      row.source_snapshot.regular_break_count =
        Number(row.source_snapshot.regular_break_count ?? 0) +
        sliceBreakCount;
      row.source_snapshot.lunch_count =
        Number(row.source_snapshot.lunch_count ?? 0) + sliceLunchCount;
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

  for (const row of rowsByKey.values()) {
    const regularBreakCount = Number(
      row.source_snapshot.regular_break_count ?? 0,
    );
    const lunchCount = Number(row.source_snapshot.lunch_count ?? 0);
    const shiftIds = Array.isArray(row.source_snapshot.shift_ids)
      ? (row.source_snapshot.shift_ids as string[])
      : [];

    for (const finding of evaluateDailyRestPolicy({
      attendanceMinutes: row.attendance_minutes,
      regularBreakCount,
      lunchCount,
      policy,
    })) {
      pushException(row, {
        severity: "warning",
        code: finding.code,
        message: finding.message,
        source_type: "attendance",
        source_ref: {
          shift_ids: shiftIds,
          attendance_minutes: row.attendance_minutes,
          regular_break_count: regularBreakCount,
          lunch_count: lunchCount,
        },
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

  const readinessExceptionUsers = new Set<string>();
  for (const row of rowsByKey.values()) {
    const hasRecordedTime =
      row.attendance_minutes > 0 ||
      row.job_minutes > 0 ||
      row.flagged_minutes > 0;
    if (
      !hasRecordedTime ||
      payrollReadyByUser.get(row.user_id) === true ||
      readinessExceptionUsers.has(row.user_id)
    ) {
      continue;
    }

    readinessExceptionUsers.add(row.user_id);
    row.blocking += 1;
    exceptions.push({
      user_id: row.user_id,
      work_date: null,
      severity: "blocking",
      code: "payroll_setup_incomplete",
      message:
        "Recorded time belongs to an employee whose payroll setup is incomplete. Mark the employee payroll-ready in Workforce People before approval.",
      source_type: "system",
      source_ref: {
        reason: "employee_not_active_and_payroll_ready",
      },
    });
  }

  const { data: existingEntries, error: existingEntriesError } = await admin
    .from("payroll_time_entries")
    .select("user_id, work_date, adjustment_minutes, approval_state")
    .eq("shop_id", shopId)
    .eq("period_id", periodId);
  if (existingEntriesError) throw new Error(existingEntriesError.message);
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

  const { data, error } = await admin.rpc("approve_payroll_period_atomic", {
    p_shop_id: shopId,
    p_actor_profile_id: actorId,
    p_period_id: periodId,
  });
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error("Payroll approval did not complete.");
}

export async function exportPeriod(params: { shopId: string; periodId: string; actorId: string; providerType?: string }) {
  const admin = createAdminSupabase() as any;
  const { shopId, periodId, actorId } = params;
  const providerType = String(params.providerType ?? "csv")
    .trim()
    .toLowerCase();
  if (!PAYROLL_EXPORT_PROVIDERS.has(providerType)) {
    throw new PayrollExportError("Unsupported payroll export provider.", 400);
  }

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

  const { data: mappings, error: mappingsErr } = await admin
    .from("payroll_employee_mappings")
    .select("user_id, external_employee_id")
    .eq("shop_id", shopId)
    .eq("provider_type", providerType);
  if (mappingsErr) throw new Error(mappingsErr.message);

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

  const employeeIds = [...grouped.keys()];
  const { data: employeeProfiles, error: profilesErr } = employeeIds.length
    ? await admin
        .from("profiles")
        .select("id, full_name, username, email")
        .eq("shop_id", shopId)
        .in("id", employeeIds)
    : { data: [], error: null };
  if (profilesErr) throw new Error(profilesErr.message);

  const employeeNameById = new Map<string, string>(
    (employeeProfiles ?? []).map(
      (profile: {
        id: string;
        full_name: string | null;
        username: string | null;
        email: string | null;
      }) => [profile.id, workforceDisplayName(profile)],
    ),
  );
  const missingReadableNames = employeeIds.filter(
    (userId) =>
      !employeeNameById.has(userId) ||
      employeeNameById.get(userId) === "Employee profile unavailable",
  );
  if (missingReadableNames.length > 0) {
    throw new PayrollExportError(
      "Every recorded employee needs a readable name before payroll can be exported.",
      409,
    );
  }

  const { data: batch, error: batchErr } = await admin
    .from("payroll_export_batches")
    .insert({
      shop_id: shopId,
      period_id: periodId,
      provider_type: providerType,
      status: "pending",
      handoff_status: "pending",
      exported_by: actorId,
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
    row_payload: {
      source: "period_snapshot",
      employee_name: employeeNameById.get(userId),
    },
  }));

  if (rows.length > 0) {
    const { error: rowsErr } = await admin.from("payroll_export_rows").insert(rows);
    if (rowsErr) {
      await admin
        .from("payroll_export_batches")
        .update({
          status: "failed",
          handoff_status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", batch.id)
        .eq("shop_id", shopId);
      throw new Error(rowsErr.message);
    }
  }

  const csvHeaders = [
    "employee_name",
    "employee_external_id",
    "regular_hours",
    "overtime_hours",
    "unpaid_break_hours",
    "total_hours",
  ];
  const csvLines = [
    csvHeaders.join(","),
    ...rows.map((row) =>
      [
        employeeNameById.get(row.user_id),
        row.employee_external_id ?? "",
        row.regular_hours,
        row.overtime_hours,
        row.unpaid_break_hours,
        row.total_hours,
      ]
        .map(escapePayrollCsvCell)
        .join(","),
    ),
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
      .update({
        status: "failed",
        handoff_status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", batch.id)
      .eq("shop_id", shopId);
    throw new Error(`Failed to persist payroll export artifact: ${uploadErr.message}`);
  }

  const { data: finalized, error: finalizeError } = await admin.rpc(
    "finalize_payroll_export_atomic",
    {
      p_shop_id: shopId,
      p_actor_profile_id: actorId,
      p_period_id: periodId,
      p_batch_id: batch.id,
      p_storage_bucket: storageBucket,
      p_storage_path: storagePath,
      p_file_size_bytes: fileSizeBytes,
      p_file_sha256: fileSha256,
      p_provider_template_version: "generic-v1",
    },
  );
  if (finalizeError || !finalized?.ok) {
    const { error: cleanupError } = await admin.storage
      .from(storageBucket)
      .remove([storagePath]);
    await admin
      .from("payroll_export_batches")
      .update({
        status: "failed",
        handoff_status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", batch.id)
      .eq("shop_id", shopId);
    throw new Error(
      `Payroll artifact was stored, but finalization failed: ${
        finalizeError?.message ?? "unknown database response"
      }${
        cleanupError
          ? `; artifact cleanup also failed: ${cleanupError.message}`
          : ""
      }`,
    );
  }

  return { batchId: batch.id, rowCount: rows.length, csv };
}
