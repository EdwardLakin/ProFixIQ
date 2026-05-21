import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

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

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function dateDiffMinutes(start: string, end: string): number {
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
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

  const cadence = payrollSettings?.cadence ?? "biweekly";
  const weekStartsOn = Number(payrollSettings?.week_starts_on ?? 1);

  const todayUtc = startOfUtcDay(today.toISOString());
  const day = todayUtc.getUTCDay();
  const diffToWeekStart = (day - weekStartsOn + 7) % 7;
  const currentWeekStart = addDays(todayUtc, -diffToWeekStart);
  const currentWeekEnd = addDays(currentWeekStart, 6);

  let periodStart = currentWeekStart;
  let periodEnd = currentWeekEnd;

  if (cadence === "biweekly") {
    const epoch = Date.UTC(2024, 0, 1);
    const weeksSinceEpoch = Math.floor((currentWeekStart.getTime() - epoch) / (7 * 24 * 60 * 60 * 1000));
    const isEven = weeksSinceEpoch % 2 === 0;
    periodStart = isEven ? currentWeekStart : addDays(currentWeekStart, -7);
    periodEnd = addDays(periodStart, 13);
  }

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

  const dailyOvertimeAfter = Number(settings?.daily_overtime_after_minutes ?? 480);
  const suspiciousShiftMinutes = Number(settings?.suspicious_shift_minutes ?? 960);

  const rangeStart = `${period.period_start}T00:00:00.000Z`;
  const rangeEnd = `${period.period_end}T23:59:59.999Z`;

  const [{ data: shifts, error: shiftsErr }, { data: jobSegments, error: jobsErr }] = await Promise.all([
    admin
      .from("tech_shifts")
      .select("id, user_id, type, status, start_time, end_time")
      .eq("shop_id", shopId)
      .gte("start_time", rangeStart)
      .lte("start_time", rangeEnd),
    admin
      .from("work_order_line_labor_segments")
      .select("id, technician_id, started_at, ended_at")
      .eq("shop_id", shopId)
      .gte("started_at", rangeStart)
      .lte("started_at", rangeEnd),
  ]);

  if (shiftsErr) throw new Error(shiftsErr.message);
  if (jobsErr) throw new Error(jobsErr.message);

  const shiftIds = (shifts ?? []).map((s: { id: string }) => s.id).filter(Boolean);
  const { data: punchEvents, error: punchEventsErr } = shiftIds.length
    ? await admin
        .from("punch_events")
        .select("shift_id, event_type, timestamp")
        .in("shift_id", shiftIds)
        .order("timestamp", { ascending: true })
    : { data: [], error: null };

  if (punchEventsErr) throw new Error(punchEventsErr.message);

  const punchEventsByShift = new Map<
    string,
    Array<{ event_type: string | null; timestamp: string | null }>
  >();
  for (const event of punchEvents ?? []) {
    const sid = event.shift_id as string | null;
    if (!sid) continue;
    const current = punchEventsByShift.get(sid) ?? [];
    current.push({
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
    warnings: number;
    blocking: number;
    source_snapshot: Record<string, unknown>;
  }>();

  const exceptions: PayrollException[] = [];

  for (const shift of shifts ?? []) {
    if (!shift.user_id) continue;
    const workDate = toIsoDate(startOfUtcDay(shift.start_time));
    const key = `${shift.user_id}:${workDate}`;
    const row = rowsByKey.get(key) ?? {
      user_id: shift.user_id,
      work_date: workDate,
      attendance_minutes: 0,
      unpaid_break_minutes: 0,
      paid_break_minutes: 0,
      job_minutes: 0,
      warnings: 0,
      blocking: 0,
      source_snapshot: { shift_ids: [], open_shift_ids: [] },
    };

    const endTime = shift.end_time ?? new Date().toISOString();
    const duration = dateDiffMinutes(shift.start_time, endTime);

    row.attendance_minutes += duration;

    const events = punchEventsByShift.get(shift.id) ?? [];
    if (events.length > 0) {
      let activeBreakStart: string | null = null;

      for (const event of events) {
        const eventType = String(event.event_type ?? "").toLowerCase();
        if (!event.timestamp) continue;
        const eventTs = clampIso(event.timestamp, shift.start_time, endTime);

        if (eventType === "break_start" || eventType === "lunch_start") {
          if (activeBreakStart) {
            row.unpaid_break_minutes += dateDiffMinutes(activeBreakStart, eventTs);
          }
          activeBreakStart = eventTs;
          continue;
        }

        if (eventType === "break_end" || eventType === "lunch_end") {
          if (activeBreakStart) {
            row.unpaid_break_minutes += dateDiffMinutes(activeBreakStart, eventTs);
            activeBreakStart = null;
          }
        }
      }

      if (activeBreakStart) {
        row.unpaid_break_minutes += dateDiffMinutes(activeBreakStart, endTime);
      }
    }

    const ids = Array.isArray(row.source_snapshot.shift_ids)
      ? (row.source_snapshot.shift_ids as string[])
      : [];
    ids.push(shift.id);
    row.source_snapshot.shift_ids = ids;
    row.source_snapshot = {
      ...row.source_snapshot,
      break_source: events.length > 0 ? "punch_events" : "none_recorded",
      punch_event_count: events.length,
    };

    if (!shift.end_time) {
      const openIds = Array.isArray(row.source_snapshot.open_shift_ids)
        ? (row.source_snapshot.open_shift_ids as string[])
        : [];
      openIds.push(shift.id);
      row.source_snapshot.open_shift_ids = openIds;
      row.blocking += 1;
      exceptions.push({
        user_id: shift.user_id,
        work_date: workDate,
        severity: "blocking",
        code: "open_punch",
        message: "Shift is still open and missing clock-out.",
        source_type: "attendance",
        source_ref: { shift_id: shift.id },
      });
    }

    if (duration > suspiciousShiftMinutes) {
      row.warnings += 1;
      exceptions.push({
        user_id: shift.user_id,
        work_date: workDate,
        severity: "warning",
        code: "suspicious_shift",
        message: `Shift length ${duration} minutes exceeds threshold ${suspiciousShiftMinutes}.`,
        source_type: "attendance",
        source_ref: { shift_id: shift.id, duration },
      });
    }

    if (duration <= 0) {
      row.blocking += 1;
      exceptions.push({
        user_id: shift.user_id,
        work_date: workDate,
        severity: "blocking",
        code: "invalid_duration",
        message: "Shift duration is invalid or negative.",
        source_type: "attendance",
        source_ref: { shift_id: shift.id },
      });
    }

    rowsByKey.set(key, row);
  }

  for (const seg of jobSegments ?? []) {
    if (!seg.technician_id || !seg.started_at) continue;
    const workDate = toIsoDate(startOfUtcDay(seg.started_at));
    const key = `${seg.technician_id}:${workDate}`;
    const row = rowsByKey.get(key) ?? {
      user_id: seg.technician_id,
      work_date: workDate,
      attendance_minutes: 0,
      unpaid_break_minutes: 0,
      paid_break_minutes: 0,
      job_minutes: 0,
      warnings: 0,
      blocking: 0,
      source_snapshot: { shift_ids: [], open_shift_ids: [], job_segment_ids: [] },
    };

    if (!seg.ended_at) {
      row.warnings += 1;
      exceptions.push({
        user_id: seg.technician_id,
        work_date: workDate,
        severity: "warning",
        code: "open_job_segment",
        message: "Job segment is still active.",
        source_type: "job_time",
        source_ref: { segment_id: seg.id },
      });
    }

    const duration = seg.ended_at ? dateDiffMinutes(seg.started_at, seg.ended_at) : 0;
    row.job_minutes += duration;

    const segIds = Array.isArray(row.source_snapshot.job_segment_ids)
      ? (row.source_snapshot.job_segment_ids as string[])
      : [];
    segIds.push(seg.id);
    row.source_snapshot.job_segment_ids = segIds;
    rowsByKey.set(key, row);
  }

  const upserts = Array.from(rowsByKey.values()).map((row) => {
    const netWorked = Math.max(0, row.attendance_minutes - row.unpaid_break_minutes);
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
      adjustment_minutes: 0,
      has_exceptions: row.warnings + row.blocking > 0,
      warning_exception_count: row.warnings,
      blocking_exception_count: row.blocking,
      approval_state: "draft",
      source_snapshot: row.source_snapshot,
    };
  });

  await admin.from("payroll_time_entries").delete().eq("shop_id", shopId).eq("period_id", periodId);
  await admin.from("payroll_time_exceptions").delete().eq("shop_id", shopId).eq("period_id", periodId);

  if (upserts.length > 0) {
    const { error } = await admin.from("payroll_time_entries").insert(upserts);
    if (error) throw new Error(error.message);
  }

  if (exceptions.length > 0) {
    const { error } = await admin.from("payroll_time_exceptions").insert(
      exceptions.map((item) => ({ ...item, shop_id: shopId, period_id: periodId })),
    );
    if (error) throw new Error(error.message);
  }

  await admin
    .from("payroll_pay_periods")
    .update({ status: "open", updated_at: new Date().toISOString() })
    .eq("id", periodId)
    .eq("shop_id", shopId);

  return { rows: upserts.length, exceptions: exceptions.length };
}

export async function approvePeriod(params: { shopId: string; periodId: string; actorId: string }) {
  const admin = createAdminSupabase() as any;
  const { shopId, periodId, actorId } = params;

  const { data: blocking } = await admin
    .from("payroll_time_exceptions")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId)
    .eq("period_id", periodId)
    .eq("severity", "blocking")
    .eq("resolved", false);

  if ((blocking?.length ?? 0) > 0) {
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

  const now = new Date().toISOString();
  await admin
    .from("payroll_pay_periods")
    .update({ status: "exported", exported_at: now, exported_by: actorId, locked_at: now, updated_at: now })
    .eq("id", periodId)
    .eq("shop_id", shopId);

  const csvHeaders = ["user_id", "employee_external_id", "regular_hours", "overtime_hours", "unpaid_break_hours", "total_hours"];
  const csvLines = [
    csvHeaders.join(","),
    ...rows.map((r) => [r.user_id, r.employee_external_id ?? "", r.regular_hours, r.overtime_hours, r.unpaid_break_hours, r.total_hours].join(",")),
  ];

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
    },
  });

  return { batchId: batch.id, rowCount: rows.length, csv: csvLines.join("\n") };
}
