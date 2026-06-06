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

type WorkOrderLineSlim = {
  id: string;
  shop_id: string | null;
  work_order_id: string | null;
  labor_time: number | null;
  assigned_tech_id: string | null;
  punchable: boolean | null;
  status: string | null;
  punched_out_at: string | null;
};

type LaborSegmentSlim = {
  technician_id: string | null;
  started_at: string;
  ended_at: string | null;
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
  revenuePerHour: number;
  efficiencyPct: number;
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
): Promise<TechLeaderboardResult> {
  const supabase = createBrowserSupabase();

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
  const { data: profiles, error: profErr } = await supabase
    .from("profiles")
    .select("id, full_name, role, shop_id")
    .eq("shop_id", shopId);

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
  const [invoicesRes, timecardsRes, segmentsRes, completedLinesRes] = await Promise.all([
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

    supabase
      .from("work_order_lines")
      .select("id, shop_id, work_order_id, labor_time, assigned_tech_id, punchable, status, punched_out_at")
      .eq("shop_id", shopId)
      .in("assigned_tech_id", techIds)
      .in("status", ["completed", "ready_to_invoice", "invoiced"])
      .gte("punched_out_at", startIso)
      .lt("punched_out_at", endExclusiveIso),
  ]);

  if (invoicesRes.error) throw invoicesRes.error;
  if (timecardsRes.error) throw timecardsRes.error;
  if (segmentsRes.error) throw segmentsRes.error;
  if (completedLinesRes.error) throw completedLinesRes.error;

  const invoices: InvoiceSlim[] = (invoicesRes.data as InvoiceSlim[]) ?? [];
  const timecards: TimecardSlim[] = (timecardsRes.data as TimecardSlim[]) ?? [];
  const segments: LaborSegmentSlim[] = (segmentsRes.data as LaborSegmentSlim[]) ?? [];
  const completedLines: WorkOrderLineSlim[] = (completedLinesRes.data as WorkOrderLineSlim[]) ?? [];

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
      revenuePerHour: 0,
      efficiencyPct: 0,
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

  // 4b) Aggregate LIVE completed jobs + billed hours from completed lines in range
  for (const line of completedLines) {
    const techId = line.assigned_tech_id;
    if (!techId) continue;

    const row = byTech.get(techId);
    if (!row) continue;

    row.jobs += 1;
    row.billedHours += safeNum(line.labor_time);
  }

  // 5) Aggregate clocked hours from labor segments (source of truth)
  for (const seg of segments) {
    const techId = seg.technician_id;
    if (!techId) continue;
    const row = byTech.get(techId);
    if (!row) continue;
    row.clockedHours += getOverlapHours(seg.started_at, seg.ended_at, startIso, endExclusiveIso);
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

  // 6) billedHours already comes from live completed lines above

  // 7) Final derived metrics
  for (const row of byTech.values()) {
    row.profit = row.revenue - row.laborCost;

    // ✅ Tech efficiency = billed ÷ worked
    row.efficiencyPct =
      row.clockedHours > 0 ? (row.billedHours / row.clockedHours) * 100 : 0;

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
