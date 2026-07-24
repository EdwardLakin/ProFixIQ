// /features/shared/lib/stats/getTechLeaderboard.ts (FULL FILE REPLACEMENT)

import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
} from "date-fns";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

import type { TimeRange } from "./getShopStats";

type SlimProfile = {
  id: string;
  full_name: string | null;
  role: string | null;
  shop_id: string | null;
};

type InvoiceSlim = {
  id: string;
  tech_id: string | null;
  shop_id: string | null;
  work_order_id: string | null;
  total: number | null;
  labor_cost: number | null;
  created_at: string | null;
};

type TimecardSlim = {
  id: string;
  user_id: string | null;
  shop_id: string | null;
  clock_in: string | null;
  clock_out: string | null;
  hours_worked: number | null;
  created_at: string | null;
};

type LaborSegmentSlim = {
  technician_id: string | null;
  started_at: string;
  ended_at: string | null;
};

type FlatRateCreditSlim = {
  technician_id: string;
  work_order_line_id: string;
  credit_hours: number | null;
};

type AttendanceEntrySlim = {
  user_id: string;
  attendance_minutes: number | null;
};

export type TechLeaderboardRow = {
  techId: string;
  name: string;
  role: string | null;

  jobs: number;
  revenue: number;
  laborCost: number;
  profit: number;

  billedHours: number;
  clockedHours: number;
  flaggedHours: number;
  actualJobHours: number;
  attendanceHours: number;
  revenuePerHour: number;
  efficiencyPct: number;
  productivityPct: number;
  overallPerformancePct: number;
};

export type TechLeaderboardResult = {
  shop_id: string;
  start: string;
  end: string;
  rows: TechLeaderboardRow[];
};

function toIso(d: Date): string {
  return d.toISOString();
}

/**
 * Normalize role strings so "Technician", "tech", "Lead Tech", etc all match.
 */
export function isTechRole(role: string | null): boolean {
  const r = (role ?? "").trim().toLowerCase();
  if (!r) return false;

  if (r === "tech" || r === "technician" || r === "mechanic") return true;
  if (r.includes("tech")) return true;
  if (r.includes("mechanic")) return true;

  return false;
}

function safeNum(v: number | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function getOverlapHours(
  startedAt: string | null | undefined,
  endedAt: string | null | undefined,
  rangeStartIso: string,
  rangeEndIso: string,
): number {
  if (!startedAt) return 0;
  const startMs = new Date(startedAt).getTime();
  if (!Number.isFinite(startMs)) return 0;
  const endMs = endedAt ? new Date(endedAt).getTime() : new Date().getTime();
  if (!Number.isFinite(endMs)) return 0;
  const windowStart = new Date(rangeStartIso).getTime();
  const windowEnd = new Date(rangeEndIso).getTime();
  const overlapMs = Math.min(endMs, windowEnd) - Math.max(startMs, windowStart);
  if (overlapMs <= 0) return 0;
  return overlapMs / (1000 * 60 * 60);
}

export async function getTechLeaderboard(
  shopId: string,
  timeRange: TimeRange,
  technicianId?: string,
): Promise<TechLeaderboardResult> {
  const supabase = createBrowserSupabase();
  const workforceDb = supabase as any;

  const now = new Date();
  let start: Date;
  let end: Date;

  switch (timeRange) {
    case "weekly":
      start = startOfWeek(now, { weekStartsOn: 1 });
      end = endOfWeek(now, { weekStartsOn: 1 });
      break;
    case "quarterly":
      start = startOfQuarter(now);
      end = endOfQuarter(now);
      break;
    case "yearly":
      start = startOfYear(now);
      end = endOfYear(now);
      break;
    case "monthly":
    default:
      start = startOfMonth(now);
      end = endOfMonth(now);
      break;
  }

  // exclusive end bound
  const endExclusive = new Date(end.getTime() + 1);

  const startIso = toIso(start);
  const endIso = toIso(end);
  const endExclusiveIso = toIso(endExclusive);

  // 1) Pull ALL profiles in shop, then filter in JS
  let profilesQuery = supabase
    .from("profiles")
    .select("id, full_name, role, shop_id")
    .eq("shop_id", shopId);
  if (technicianId) profilesQuery = profilesQuery.eq("id", technicianId);
  const { data: profiles, error: profErr } = await profilesQuery;

  if (profErr) throw profErr;

  const techProfiles: SlimProfile[] = (profiles ?? [])
    .map((p) => ({
      id: p.id,
      full_name: p.full_name ?? null,
      role: p.role ?? null,
      shop_id: p.shop_id ?? null,
    }))
    .filter((p) => isTechRole(p.role));

  const techIds = techProfiles.map((p) => p.id).filter(Boolean);

  if (techIds.length === 0) {
    return { shop_id: shopId, start: startIso, end: endIso, rows: [] };
  }

  // 2) Pull accounting + live labor/completion sources for this range
  const [invoicesRes, timecardsRes, segmentsRes, creditsRes, attendanceRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, tech_id, shop_id, work_order_id, total, labor_cost, created_at")
      .eq("shop_id", shopId)
      .in("tech_id", techIds)
      .gte("created_at", startIso)
      .lt("created_at", endExclusiveIso),

    supabase
      .from("payroll_timecards")
      .select("id, user_id, shop_id, clock_in, clock_out, hours_worked, created_at")
      .eq("shop_id", shopId)
      .in("user_id", techIds)
      .gte("clock_in", startIso)
      .lt("clock_in", endExclusiveIso),

    supabase
      .from("work_order_line_labor_segments")
      .select("technician_id, started_at, ended_at")
      .eq("shop_id", shopId)
      .in("technician_id", techIds)
      .lt("started_at", endExclusiveIso)
      .or(`ended_at.gte.${startIso},ended_at.is.null`),

    workforceDb
      .from("work_order_line_flat_rate_credits")
      .select("technician_id, work_order_line_id, credit_hours")
      .eq("shop_id", shopId)
      .in("technician_id", techIds)
      .gte("credited_at", startIso)
      .lt("credited_at", endExclusiveIso),

    workforceDb
      .from("payroll_time_entries")
      .select("user_id, attendance_minutes")
      .eq("shop_id", shopId)
      .in("user_id", techIds)
      .gte("work_date", startIso.slice(0, 10))
      .lte("work_date", endIso.slice(0, 10)),
  ]);

  if (invoicesRes.error) throw invoicesRes.error;
  if (timecardsRes.error) throw timecardsRes.error;
  if (segmentsRes.error) throw segmentsRes.error;
  if (creditsRes.error) throw creditsRes.error;
  if (attendanceRes.error) throw attendanceRes.error;

  const invoices: InvoiceSlim[] = (invoicesRes.data as InvoiceSlim[]) ?? [];
  const timecards: TimecardSlim[] = (timecardsRes.data as TimecardSlim[]) ?? [];
  const segments: LaborSegmentSlim[] = (segmentsRes.data as LaborSegmentSlim[]) ?? [];
  const credits: FlatRateCreditSlim[] =
    (creditsRes.data as FlatRateCreditSlim[]) ?? [];
  const attendance: AttendanceEntrySlim[] =
    (attendanceRes.data as AttendanceEntrySlim[]) ?? [];

  // 3) Seed rows so techs show even with 0 activity
  const byTech = new Map<string, TechLeaderboardRow>();

  for (const prof of techProfiles) {
    if (!prof.id) continue;
    byTech.set(prof.id, {
      techId: prof.id,
      name: prof.full_name || "Unnamed tech",
      role: prof.role,
      jobs: 0,
      revenue: 0,
      laborCost: 0,
      profit: 0,
      billedHours: 0,
      clockedHours: 0,
      flaggedHours: 0,
      actualJobHours: 0,
      attendanceHours: 0,
      revenuePerHour: 0,
      efficiencyPct: 0,
      productivityPct: 0,
      overallPerformancePct: 0,
    });
  }

  // 4) Aggregate accounting metrics from invoices only
  for (const inv of invoices) {
    const techId = inv.tech_id;
    if (!techId) continue;

    const row = byTech.get(techId);
    if (!row) continue;

    row.revenue += safeNum(inv.total);
    row.laborCost += safeNum(inv.labor_cost);
  }

  // 4b) Durable technician credits are the source for flagged hours.
  const creditedLines = new Map<string, Set<string>>();
  for (const credit of credits) {
    const row = byTech.get(credit.technician_id);
    if (!row) continue;
    const hours = safeNum(credit.credit_hours);
    row.flaggedHours += hours;
    row.billedHours += hours;
    const lines = creditedLines.get(credit.technician_id) ?? new Set<string>();
    lines.add(credit.work_order_line_id);
    creditedLines.set(credit.technician_id, lines);
  }
  for (const [techId, lines] of creditedLines) {
    const row = byTech.get(techId);
    if (row) row.jobs = lines.size;
  }

  // 5) Aggregate clocked hours from labor segments (source of truth)
  for (const seg of segments) {
    const techId = seg.technician_id;
    if (!techId) continue;
    const row = byTech.get(techId);
    if (!row) continue;
    const hours = getOverlapHours(seg.started_at, seg.ended_at, startIso, endExclusiveIso);
    row.actualJobHours += hours;
    row.clockedHours += hours;
  }

  // Compatibility fallback for historical windows where no segments were created yet.
  for (const tc of timecards) {
    const techId = tc.user_id;
    if (!techId) continue;

    const row = byTech.get(techId);
    if (!row) continue;
    if (row.clockedHours <= 0) {
      row.clockedHours += safeNum(tc.hours_worked);
    }
  }

  // Attendance is distinct from actual job time. Historical rows fall back to
  // timecards when the canonical pay-period snapshot is not available.
  for (const entry of attendance) {
    const row = byTech.get(entry.user_id);
    if (!row) continue;
    row.attendanceHours += safeNum(entry.attendance_minutes) / 60;
  }
  for (const row of byTech.values()) {
    if (row.attendanceHours <= 0) {
      row.attendanceHours = timecards
        .filter((timecard) => timecard.user_id === row.techId)
        .reduce((total, timecard) => total + safeNum(timecard.hours_worked), 0);
    }
  }

  // 7) Final derived metrics
  for (const row of byTech.values()) {
    row.profit = row.revenue - row.laborCost;

    // ✅ Tech efficiency = billed ÷ worked
    row.efficiencyPct =
      row.actualJobHours > 0 ? (row.flaggedHours / row.actualJobHours) * 100 : 0;
    row.productivityPct =
      row.attendanceHours > 0 ? (row.actualJobHours / row.attendanceHours) * 100 : 0;
    row.overallPerformancePct =
      row.attendanceHours > 0 ? (row.flaggedHours / row.attendanceHours) * 100 : 0;

    row.revenuePerHour =
      row.clockedHours > 0 ? row.revenue / row.clockedHours : 0;
  }

  const rows = Array.from(byTech.values()).sort((a, b) => b.revenue - a.revenue);

  return {
    shop_id: shopId,
    start: startIso,
    end: endIso,
    rows,
  };
}
