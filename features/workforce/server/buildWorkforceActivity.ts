import type { Database } from "@/features/shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { getShopTodayTomorrowRanges } from "@/features/shared/lib/utils/shopDayWindow";
import {
  clampNonNegative,
  hasOverlaps,
  overlapMinutes,
  sumPairedDurations,
} from "../lib/activityMetrics";
import {
  WORKFORCE_ACTIVITY_THRESHOLDS,
  exception,
} from "../lib/activityExceptions";
import type {
  WorkforceActivityFeedItem,
  WorkforceActivityResponse,
  WorkforceOperationalState,
  WorkforceTechnicianActivity,
} from "../lib/activityTypes";

type DB = Database;
type Shift = DB["public"]["Tables"]["tech_shifts"]["Row"];
type Punch = DB["public"]["Tables"]["punch_events"]["Row"];
type Segment = DB["public"]["Tables"]["work_order_line_labor_segments"]["Row"];
type OperationalLog = DB["public"]["Tables"]["activity_logs"]["Row"];
type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
};
type Line = {
  id: string;
  work_order_id: string;
  description: string | null;
  job_type: string | null;
  assigned_tech_id: string | null;
  labor_time: number | null;
  status: string | null;
  line_status: string | null;
  line_type?: string | null;
  shop_id: string;
  updated_at: string | null;
  punched_out_at: string | null;
  hold_reason?: string | null;
};
type WO = {
  id: string;
  shop_id: string;
  custom_id: string | null;
  external_id: string | null;
  status: string | null;
  customer_id: string | null;
  customer_name: string | null;
  vehicle_id: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_unit_number: string | null;
  vehicle_license_plate: string | null;
};
type Customer = {
  id: string;
  name: string | null;
  business_name: string | null;
  first_name: string | null;
  last_name: string | null;
  shop_id: string | null;
};
type Vehicle = {
  id: string;
  year: number | null;
  make: string | null;
  model: string | null;
  unit_number: string | null;
  license_plate: string | null;
  shop_id: string | null;
};
const INACTIVE_LINE = new Set([
  "completed",
  "cancelled",
  "closed",
  "invoiced",
  "declined",
  "voided",
]);
const INFORMATIONAL_LINE_TYPES = new Set([
  "informational",
  "info",
  "note",
  "notes",
  "inspection_note",
]);
function name(p?: Profile) {
  return p?.full_name?.trim() || p?.email?.trim() || "Unknown employee";
}
function woNum(wo?: WO) {
  return wo?.custom_id || wo?.external_id || null;
}
function cust(c?: Customer, wo?: WO) {
  return (
    c?.business_name ||
    c?.name ||
    [c?.first_name, c?.last_name].filter(Boolean).join(" ") ||
    wo?.customer_name ||
    null
  );
}
function vehicle(v?: Vehicle, wo?: WO) {
  const parts = [
    v?.year ?? wo?.vehicle_year,
    v?.make ?? wo?.vehicle_make,
    v?.model ?? wo?.vehicle_model,
  ].filter(Boolean);
  const unit = v?.unit_number ?? wo?.vehicle_unit_number;
  const plate = v?.license_plate ?? wo?.vehicle_license_plate;
  return (
    [...parts, unit ? `Unit ${unit}` : null, plate ? `Plate ${plate}` : null]
      .filter(Boolean)
      .join(" ") || null
  );
}
function latestPunch(events: Punch[]) {
  return (
    [...events].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime() ||
        a.id.localeCompare(b.id),
    )[0] ?? null
  );
}
function canonicalSoldLaborHours(line?: Line): number {
  const hours = Number(line?.labor_time ?? 0);
  return Number.isFinite(hours) && hours > 0 ? hours : 0;
}
function isSoldLaborLine(line: Line | undefined, shopId: string): line is Line {
  return Boolean(
    line &&
    line.shop_id === shopId &&
    !INFORMATIONAL_LINE_TYPES.has(String(line.line_type ?? "").toLowerCase()) &&
    canonicalSoldLaborHours(line) > 0,
  );
}
function soldLaborHoursForSegments(
  segments: Segment[],
  lines: Map<string, Line>,
  workOrders: Map<string, WO>,
  shopId: string,
): number {
  const lineIds = new Set<string>();
  for (const segment of segments) {
    const line = lines.get(segment.work_order_line_id);
    if (
      segment.shop_id === shopId &&
      isSoldLaborLine(line, shopId) &&
      workOrders.has(segment.work_order_id)
    )
      lineIds.add(line.id);
  }
  return [...lineIds].reduce(
    (sum, lineId) => sum + canonicalSoldLaborHours(lines.get(lineId)),
    0,
  );
}
type LaborSegmentFeedAction =
  | "started_job"
  | "resumed_job"
  | "placed_on_hold"
  | "paused_job"
  | "completed_job"
  | "stopped_at_shift_end"
  | "stopped_job_time";

function normalizeToken(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");
}

function eventNear(log: OperationalLog, at: string): boolean {
  if (!log.timestamp) return false;
  return (
    Math.abs(new Date(log.timestamp).getTime() - new Date(at).getTime()) <= 5000
  );
}

function logsForLineAt(
  logsByLine: Map<string, OperationalLog[]>,
  lineId: string,
  at: string,
): OperationalLog[] {
  return (logsByLine.get(lineId) ?? []).filter((log) => eventNear(log, at));
}

export function resolveLaborSegmentFeedAction(params: {
  segment: Segment;
  sameLineEarlierSegments: Segment[];
  logsAtTimestamp?: OperationalLog[];
}): LaborSegmentFeedAction {
  const { segment, sameLineEarlierSegments, logsAtTimestamp = [] } = params;
  if (!segment.ended_at) {
    return sameLineEarlierSegments.some(
      (s) =>
        s.id !== segment.id &&
        new Date(s.started_at).getTime() <
          new Date(segment.started_at).getTime(),
    )
      ? "resumed_job"
      : "started_job";
  }
  const closeReason = [segment.pause_reason, segment.source]
    .map(normalizeToken)
    .filter(Boolean)
    .join(" ");
  const logEvents = logsAtTimestamp.map((log) => normalizeToken(log.action));
  if (logEvents.includes("pause") || closeReason.includes("hold"))
    return "placed_on_hold";
  if (closeReason.includes("pause")) return "paused_job";
  if (
    logEvents.includes("finish") ||
    logEvents.includes("complete") ||
    closeReason.includes("finish") ||
    closeReason.includes("complete")
  )
    return "completed_job";
  if (closeReason.includes("shift_end") || closeReason.includes("end_shift"))
    return "stopped_at_shift_end";
  return "stopped_job_time";
}

function actionCopy(action: LaborSegmentFeedAction, line?: Line): string {
  if (action === "started_job") return "started job";
  if (action === "resumed_job") return "resumed job";
  if (action === "completed_job") return "completed job";
  if (action === "stopped_at_shift_end") return "job time stopped at shift end";
  if (action === "stopped_job_time") return "stopped job time";
  if (action === "paused_job") return "paused job";
  const reason = line?.hold_reason?.trim();
  return reason ? `placed job on hold — ${reason}` : "placed job on hold";
}

function activityFromEvents(shift: Shift | null, events: Punch[]) {
  const latest = latestPunch(events);
  const t = latest?.event_type?.toLowerCase();
  if (shift?.end_time || t === "end_shift") return "shift_ended";
  const lunchStart =
    [...events]
      .reverse()
      .find(
        (e) => e.event_type === "lunch_start" || e.event_type === "lunch_end",
      )?.event_type === "lunch_start";
  if (lunchStart) return "on_lunch";
  const breakStart =
    [...events]
      .reverse()
      .find(
        (e) => e.event_type === "break_start" || e.event_type === "break_end",
      )?.event_type === "break_start";
  if (breakStart) return "on_break";
  return shift ? "clocked_in_idle" : "off_shift";
}

export async function buildWorkforceActivity(params: {
  shopId: string;
  timezone?: string | null;
  now?: Date;
}) {
  const admin = createAdminSupabase();
  const now = params.now ?? new Date();
  const nowIso = now.toISOString();
  const ranges = getShopTodayTomorrowRanges(params.timezone, now);
  const from = ranges.today.start;
  const to = ranges.today.end;
  const [shiftsRes, profilesRes, segmentsRes] = await Promise.all([
    admin
      .from("tech_shifts")
      .select("*")
      .eq("shop_id", params.shopId)
      .lt("start_time", to)
      .or(`end_time.is.null,end_time.gt.${from}`)
      .order("start_time", { ascending: false }),
    admin
      .from("profiles")
      .select("id, full_name, email, role")
      .eq("shop_id", params.shopId),
    admin
      .from("work_order_line_labor_segments")
      .select("*")
      .eq("shop_id", params.shopId)
      .lt("started_at", to)
      .or(`ended_at.is.null,ended_at.gte.${from}`)
      .order("started_at", { ascending: false }),
  ]);
  const err = [shiftsRes, profilesRes, segmentsRes].find(
    (r) => r.error,
  )?.error;
  if (err) throw err;
  const shifts = (shiftsRes.data ?? []) as Shift[];
  const profiles = (profilesRes.data ?? []) as Profile[];
  const segments = (segmentsRes.data ?? []) as Segment[];
  const shiftIds = shifts.map((shift) => shift.id).filter(Boolean);
  const punchesScopedRes = shiftIds.length
    ? await admin
        .from("punch_events")
        .select("*")
        .in("shift_id", shiftIds)
        .order("timestamp", { ascending: true })
    : { data: [], error: null };
  if (punchesScopedRes.error) throw punchesScopedRes.error;
  const punches = (punchesScopedRes.data ?? []) as Punch[];
  const lineIds = [...new Set(segments.map((s) => s.work_order_line_id))];
  const woIds = [...new Set(segments.map((s) => s.work_order_id))];
  const [linesRes, woRes] = await Promise.all([
    lineIds.length
      ? admin
          .from("work_order_lines")
          .select(
            "id,work_order_id,description,job_type,assigned_tech_id,labor_time,status,line_status,line_type,shop_id,updated_at,punched_out_at,hold_reason",
          )
          .eq("shop_id", params.shopId)
          .in("id", lineIds)
      : Promise.resolve({ data: [], error: null }),
    woIds.length
      ? admin
          .from("work_orders")
          .select(
            "id,shop_id,custom_id,external_id,status,customer_id,customer_name,vehicle_id,vehicle_year,vehicle_make,vehicle_model,vehicle_unit_number,vehicle_license_plate",
          )
          .eq("shop_id", params.shopId)
          .in("id", woIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (linesRes.error || woRes.error) throw linesRes.error || woRes.error;
  const lines = (linesRes.data ?? []) as Line[];
  const wos = (woRes.data ?? []) as WO[];
  const operationalLogsRes = lineIds.length
    ? await admin
        .from("activity_logs")
        .select("*")
        .eq("target_table", "work_order_line")
        .in("target_id", lineIds)
        .gte("timestamp", from)
        .lt("timestamp", to)
    : { data: [], error: null };
  if (operationalLogsRes.error) throw operationalLogsRes.error;
  const customerIds = [
    ...new Set(wos.map((w) => w.customer_id).filter(Boolean)),
  ] as string[];
  const vehicleIds = [
    ...new Set(wos.map((w) => w.vehicle_id).filter(Boolean)),
  ] as string[];
  const [customersRes, vehiclesRes] = await Promise.all([
    customerIds.length
      ? admin
          .from("customers")
          .select("id,name,business_name,first_name,last_name,shop_id")
          .eq("shop_id", params.shopId)
          .in("id", customerIds)
      : Promise.resolve({ data: [], error: null }),
    vehicleIds.length
      ? admin
          .from("vehicles")
          .select("id,year,make,model,unit_number,license_plate,shop_id")
          .eq("shop_id", params.shopId)
          .in("id", vehicleIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (customersRes.error || vehiclesRes.error)
    throw customersRes.error || vehiclesRes.error;
  return composeWorkforceActivity({
    shopId: params.shopId,
    nowIso,
    from,
    to,
    shifts,
    profiles,
    punches,
    segments,
    lines,
    workOrders: wos,
    customers: (customersRes.data ?? []) as Customer[],
    vehicles: (vehiclesRes.data ?? []) as Vehicle[],
    operationalLogs: (operationalLogsRes.data ?? []) as OperationalLog[],
  });
}

export function composeWorkforceActivity(input: {
  shopId: string;
  nowIso: string;
  from: string;
  to: string;
  shifts: Shift[];
  profiles: Profile[];
  punches: Punch[];
  segments: Segment[];
  lines: Line[];
  workOrders: WO[];
  customers: Customer[];
  vehicles: Vehicle[];
  operationalLogs?: OperationalLog[];
}): WorkforceActivityResponse {
  const scopedShifts = input.shifts.filter((s) => s.shop_id === input.shopId);
  const scopedSegments = input.segments.filter((s) => s.shop_id === input.shopId);
  const scopedShiftIds = new Set(scopedShifts.map((s) => s.id));
  const scopedPunches = input.punches.filter((p) => p.shift_id && scopedShiftIds.has(p.shift_id));
  const profiles = new Map(input.profiles.map((p) => [p.id, p]));
  const lines = new Map(
    input.lines.filter((l) => l.shop_id === input.shopId).map((l) => [l.id, l]),
  );
  const wos = new Map(
    input.workOrders
      .filter((w) => w.shop_id === input.shopId)
      .map((w) => [w.id, w]),
  );
  const customers = new Map(input.customers.map((c) => [c.id, c]));
  const vehicles = new Map(input.vehicles.map((v) => [v.id, v]));
  const users = new Set<string>([
    ...(scopedShifts.map((s) => s.user_id).filter(Boolean) as string[]),
    ...scopedSegments.map((s) => s.technician_id),
  ]);
  const punchesByShift = new Map<string, Punch[]>();
  scopedPunches.forEach((p) => {
    if (p.shift_id)
      punchesByShift.set(p.shift_id, [
        ...(punchesByShift.get(p.shift_id) ?? []),
        p,
      ]);
  });
  const shiftsByUser = new Map<string, Shift>();
  scopedShifts.forEach((s) => {
    if (
      s.user_id &&
      (!shiftsByUser.get(s.user_id) ||
        new Date(s.start_time) >
          new Date(shiftsByUser.get(s.user_id)!.start_time))
    )
      shiftsByUser.set(s.user_id, s);
  });
  const segsByUser = new Map<string, Segment[]>();
  scopedSegments.forEach((s) =>
    segsByUser.set(s.technician_id, [
      ...(segsByUser.get(s.technician_id) ?? []),
      s,
    ]),
  );
  const activities: WorkforceTechnicianActivity[] = [];
  for (const userId of [...users].sort((a, b) =>
    name(profiles.get(a)).localeCompare(name(profiles.get(b))),
  )) {
    const shift = shiftsByUser.get(userId) ?? null;
    const shiftEvents = shift?.id ? (punchesByShift.get(shift.id) ?? []) : [];
    const latest = latestPunch(shiftEvents);
    const userSegs = segsByUser.get(userId) ?? [];
    const activeSegs = userSegs
      .filter(
        (s) =>
          !s.ended_at &&
          lines.has(s.work_order_line_id) &&
          wos.has(s.work_order_id) &&
          !INACTIVE_LINE.has(
            String(
              lines.get(s.work_order_line_id)?.line_status ||
                lines.get(s.work_order_line_id)?.status ||
                "",
            ).toLowerCase(),
          ),
      )
      .sort(
        (a, b) =>
          new Date(a.started_at).getTime() - new Date(b.started_at).getTime() ||
          a.id.localeCompare(b.id),
      );
    const active = activeSegs[0] ?? null;
    const line = active ? lines.get(active.work_order_line_id) : undefined;
    const wo = active ? wos.get(active.work_order_id) : undefined;
    const currentJob =
      active && line && wo
        ? {
            laborSegmentId: active.id,
            workOrderId: wo.id,
            workOrderNumber: woNum(wo),
            workOrderStatus: wo.status,
            lineId: line.id,
            lineDescription: line.description,
            jobType: line.job_type,
            customerId: wo.customer_id,
            customerName: cust(
              wo.customer_id ? customers.get(wo.customer_id) : undefined,
              wo,
            ),
            vehicleId: wo.vehicle_id,
            vehicleLabel: vehicle(
              wo.vehicle_id ? vehicles.get(wo.vehicle_id) : undefined,
              wo,
            ),
            jobStartedAt: active.started_at,
            elapsedMinutes: overlapMinutes(
              active.started_at,
              null,
              active.started_at,
              input.nowIso,
            ),
            assignedTechId: line.assigned_tech_id,
          }
        : null;
    const breakMinutes = sumPairedDurations(
      shiftEvents,
      "break_start",
      "break_end",
      input.nowIso,
    );
    const lunchMinutes = sumPairedDurations(
      shiftEvents,
      "lunch_start",
      "lunch_end",
      input.nowIso,
    );
    const shiftMinutes = shift
      ? overlapMinutes(
          shift.start_time,
          shift.end_time,
          input.from,
          input.nowIso,
        )
      : 0;
    const jobMinutes = clampNonNegative(
      userSegs.reduce(
        (sum, s) =>
          sum +
          overlapMinutes(s.started_at, s.ended_at, input.from, input.nowIso),
        0,
      ),
    );
    const soldLaborHours = soldLaborHoursForSegments(
      userSegs,
      lines,
      wos,
      input.shopId,
    );
    const completedJobCount = userSegs.filter(
      (s) =>
        s.ended_at &&
        new Date(s.ended_at) >= new Date(input.from) &&
        new Date(s.ended_at) < new Date(input.to),
    ).length;
    const exceptions = [] as WorkforceTechnicianActivity["exceptions"];
    const base = activityFromEvents(shift, shiftEvents);
    let operationalState: WorkforceOperationalState = currentJob
      ? "working_on_job"
      : base;
    if (base === "on_break" || base === "on_lunch" || base === "shift_ended")
      operationalState = base;
    const idleMinutes = clampNonNegative(
      shiftMinutes - breakMinutes - lunchMinutes - jobMinutes,
    );
    if (
      shift &&
      !shift.end_time &&
      !currentJob &&
      operationalState === "clocked_in_idle" &&
      idleMinutes > WORKFORCE_ACTIVITY_THRESHOLDS.idleMinutes
    )
      exceptions.push(
        exception({
          code: "clocked_in_no_active_job",
          severity: "warning",
          message: `Clocked in — no active job for ${idleMinutes} min.`,
          recommendedAction: "Assign work or confirm waiting state.",
          relatedEmployeeId: userId,
        }),
      );
    if (active && !shift)
      exceptions.push(
        exception({
          code: "active_job_off_shift",
          severity: "blocking",
          message: "Active job segment exists while technician is off shift.",
          recommendedAction: "Start/correct shift or close the job segment.",
          relatedEmployeeId: userId,
          relatedWorkOrderId: active.work_order_id,
          relatedLineId: active.work_order_line_id,
        }),
      );
    if (activeSegs.length > 1)
      exceptions.push(
        exception({
          code: "multiple_active_jobs",
          severity: "blocking",
          message: "Multiple active job segments are open for this technician.",
          recommendedAction:
            "Close the incorrect active segment before payroll review.",
          relatedEmployeeId: userId,
          relatedWorkOrderId: active.work_order_id,
          relatedLineId: active.work_order_line_id,
        }),
      );
    if (active && shift?.end_time)
      exceptions.push(
        exception({
          code: "shift_ended_with_active_job",
          severity: "blocking",
          message: "Shift ended while a job segment remains active.",
          recommendedAction: "Close or correct the job segment.",
          relatedEmployeeId: userId,
          relatedWorkOrderId: active.work_order_id,
          relatedLineId: active.work_order_line_id,
        }),
      );
    if (active && (!line?.assigned_tech_id || line.assigned_tech_id !== userId))
      exceptions.push(
        exception({
          code: "active_job_unassigned",
          severity: "warning",
          message: "Active job is not assigned to the technician punching it.",
          recommendedAction: "Assign the line or verify the punch.",
          relatedEmployeeId: userId,
          relatedWorkOrderId: active.work_order_id,
          relatedLineId: active.work_order_line_id,
        }),
      );
    if (
      breakMinutes > WORKFORCE_ACTIVITY_THRESHOLDS.longBreakMinutes &&
      operationalState === "on_break"
    )
      exceptions.push(
        exception({
          code: "long_break",
          severity: "warning",
          message: `Break has exceeded ${WORKFORCE_ACTIVITY_THRESHOLDS.longBreakMinutes} min.`,
          recommendedAction: "Check technician status.",
          relatedEmployeeId: userId,
        }),
      );
    if (
      lunchMinutes > WORKFORCE_ACTIVITY_THRESHOLDS.longLunchMinutes &&
      operationalState === "on_lunch"
    )
      exceptions.push(
        exception({
          code: "long_lunch",
          severity: "warning",
          message: `Lunch has exceeded ${WORKFORCE_ACTIVITY_THRESHOLDS.longLunchMinutes} min.`,
          recommendedAction: "Check technician status.",
          relatedEmployeeId: userId,
        }),
      );
    if (
      currentJob &&
      Number(line?.labor_time ?? 0) > 0 &&
      currentJob.elapsedMinutes / 60 >
        Number(line?.labor_time) *
          WORKFORCE_ACTIVITY_THRESHOLDS.jobOverEstimateRatio
    )
      exceptions.push(
        exception({
          code: "job_over_estimate",
          severity: "warning",
          message: "Elapsed job time is materially over sold labor time.",
          recommendedAction: "Review estimate vs. actual progress.",
          relatedEmployeeId: userId,
          relatedWorkOrderId: currentJob.workOrderId,
          relatedLineId: currentJob.lineId,
        }),
      );
    if (hasOverlaps(userSegs, input.nowIso))
      exceptions.push(
        exception({
          code: "overlapping_job_segments",
          severity: "blocking",
          message:
            "Overlapping job segments make productive time inconsistent.",
          recommendedAction: "Correct overlapping job punches.",
          relatedEmployeeId: userId,
        }),
      );
    activities.push({
      userId,
      employeeName: name(profiles.get(userId)),
      employeeEmail: profiles.get(userId)?.email ?? null,
      workforceRole: profiles.get(userId)?.role ?? null,
      shiftId: shift?.id ?? null,
      shiftStatus: shift?.status ?? null,
      shiftActivity: operationalState,
      shiftStartTime: shift?.start_time ?? null,
      shiftEndTime: shift?.end_time ?? null,
      latestShiftEventType: latest?.event_type ?? null,
      latestShiftEventAt: latest?.timestamp ?? null,
      currentJob,
      today: {
        shiftMinutes,
        breakMinutes,
        lunchMinutes,
        jobMinutes,
        productiveMinutes: jobMinutes,
        idleMinutes,
        soldLaborHours,
        completedJobCount,
      },
      operationalState,
      exceptions,
    });
  }
  const logsByLine = new Map<string, OperationalLog[]>();
  for (const log of input.operationalLogs ?? []) {
    if (log.target_table === "work_order_line" && log.target_id) {
      logsByLine.set(log.target_id, [
        ...(logsByLine.get(log.target_id) ?? []),
        log,
      ]);
    }
  }
  const segmentsByLine = new Map<string, Segment[]>();
  for (const segment of input.segments) {
    segmentsByLine.set(segment.work_order_line_id, [
      ...(segmentsByLine.get(segment.work_order_line_id) ?? []),
      segment,
    ]);
  }
  const feed: WorkforceActivityFeedItem[] = [
    ...input.punches.map((p) => ({
      id: p.id,
      timestamp: p.timestamp,
      employeeName: name(profiles.get(p.user_id ?? "")),
      action: String(p.event_type).replaceAll("_", " "),
    })),
    ...input.segments.flatMap((s) => {
      const l = lines.get(s.work_order_line_id);
      const w = wos.get(s.work_order_id);
      const sameLineEarlierSegments =
        segmentsByLine.get(s.work_order_line_id) ?? [];
      const startAction = resolveLaborSegmentFeedAction({
        segment: { ...s, ended_at: null },
        sameLineEarlierSegments,
      });
      return [
        {
          id: `${s.id}:start`,
          timestamp: s.started_at,
          employeeName: name(profiles.get(s.technician_id)),
          action: actionCopy(startAction, l),
          workOrderNumber: woNum(w),
          lineDescription: l?.description ?? null,
          workOrderId: s.work_order_id,
          lineId: s.work_order_line_id,
        },
        ...(s.ended_at
          ? [
              {
                id: `${s.id}:end`,
                timestamp: s.ended_at,
                employeeName: name(profiles.get(s.technician_id)),
                action: actionCopy(
                  resolveLaborSegmentFeedAction({
                    segment: s,
                    sameLineEarlierSegments,
                    logsAtTimestamp: logsForLineAt(
                      logsByLine,
                      s.work_order_line_id,
                      s.ended_at,
                    ),
                  }),
                  l,
                ),
                workOrderNumber: woNum(w),
                lineDescription: l?.description ?? null,
                workOrderId: s.work_order_id,
                lineId: s.work_order_line_id,
              },
            ]
          : []),
      ];
    }),
    ...(input.operationalLogs ?? [])
      .filter((log) => {
        if (
          log.action !== "resume" ||
          log.target_table !== "work_order_line" ||
          !log.timestamp ||
          !log.target_id
        )
          return false;
        return !(segmentsByLine.get(log.target_id) ?? []).some(
          (segment) =>
            Math.abs(
              new Date(segment.started_at).getTime() -
                new Date(log.timestamp!).getTime(),
            ) <= 5000,
        );
      })
      .map((log) => {
        const l = log.target_id ? lines.get(log.target_id) : undefined;
        const w = l ? wos.get(l.work_order_id) : undefined;
        return {
          id: `${log.id}:release`,
          timestamp: log.timestamp!,
          employeeName: name(profiles.get(log.user_id ?? "")),
          action: "released hold on job",
          workOrderNumber: woNum(w),
          lineDescription: l?.description ?? null,
          workOrderId: l?.work_order_id ?? null,
          lineId: l?.id ?? null,
        };
      }),
  ]
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime() ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 50);
  const worked = activities.reduce(
    (s, a) =>
      s + a.today.shiftMinutes - a.today.breakMinutes - a.today.lunchMinutes,
    0,
  );
  const job = activities.reduce((s, a) => s + a.today.jobMinutes, 0);
  const soldLaborHoursToday = soldLaborHoursForSegments(
    input.segments,
    lines,
    wos,
    input.shopId,
  );
  return {
    activities,
    feed,
    summary: {
      activeTechnicians: activities.filter(
        (a) =>
          a.operationalState !== "off_shift" &&
          a.operationalState !== "shift_ended",
      ).length,
      workingOnJobs: activities.filter(
        (a) => a.operationalState === "working_on_job",
      ).length,
      idleTechnicians: activities.filter(
        (a) => a.operationalState === "clocked_in_idle",
      ).length,
      onBreak: activities.filter((a) => a.operationalState === "on_break")
        .length,
      onLunch: activities.filter((a) => a.operationalState === "on_lunch")
        .length,
      endedToday: activities.filter((a) => a.operationalState === "shift_ended")
        .length,
      jobMinutesToday: job,
      soldLaborHoursToday,
      utilizationPct: worked > 0 ? Math.round((job / worked) * 100) : 0,
      activeExceptionCount: activities.reduce(
        (s, a) => s + a.exceptions.length,
        0,
      ),
    },
    generatedAt: input.nowIso,
    sourceMap: {
      shiftState: "tech_shifts + punch_events",
      jobActivity:
        "work_order_line_labor_segments + activity_logs + work_order_lines + work_orders",
      identity: "profiles scoped by shop_id",
      customerVehicle: "customers + vehicles scoped by shop_id",
    },
  };
}
