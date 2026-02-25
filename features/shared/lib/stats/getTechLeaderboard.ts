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
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
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
  assigned_tech_id: string | null;
  punchable: boolean | null;
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
function isTechRole(role: string | null): boolean {
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

function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function getTechLeaderboard(
  shopId: string,
  timeRange: TimeRange,
): Promise<TechLeaderboardResult> {
  const supabase = createClientComponentClient<Database>();

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

  // 2) Invoices + timecards in range
  const [invoicesRes, timecardsRes] = await Promise.all([
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
  ]);

  if (invoicesRes.error) throw invoicesRes.error;
  if (timecardsRes.error) throw timecardsRes.error;

  const invoices: InvoiceSlim[] = (invoicesRes.data as InvoiceSlim[]) ?? [];
  const timecards: TimecardSlim[] = (timecardsRes.data as TimecardSlim[]) ?? [];

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

  // 4) Aggregate revenue/labor/jobs from invoices + collect WO ids per tech
  const workOrdersByTech = new Map<string, Set<string>>();
  const allWorkOrderIds: string[] = [];

  for (const inv of invoices) {
    const techId = inv.tech_id;
    if (!techId) continue;

    const row = byTech.get(techId);
    if (!row) continue;

    row.jobs += 1;
    row.revenue += safeNum(inv.total);
    row.laborCost += safeNum(inv.labor_cost);

    const woId = inv.work_order_id;
    if (woId) {
      if (!workOrdersByTech.has(techId)) workOrdersByTech.set(techId, new Set());
      workOrdersByTech.get(techId)!.add(woId);
      allWorkOrderIds.push(woId);
    }
  }

  // 5) Aggregate clocked hours from payroll timecards
  for (const tc of timecards) {
    const techId = tc.user_id;
    if (!techId) continue;

    const row = byTech.get(techId);
    if (!row) continue;

    row.clockedHours += safeNum(tc.hours_worked);
  }

  // 6) Billed hours = sum(work_order_lines.labor_time) for invoiced work orders
  // Prefer lines assigned to the invoice tech; fallback to all lines on that WO if none match.
  const uniqueWorkOrderIds = Array.from(new Set(allWorkOrderIds)).filter(Boolean);

  if (uniqueWorkOrderIds.length > 0) {
    const chunks = chunk(uniqueWorkOrderIds, 400);

    // pull all lines for those WOs (chunked)
    const allLines: WorkOrderLineSlim[] = [];

    for (const ids of chunks) {
      const { data, error } = await supabase
        .from("work_order_lines")
        .select("id, shop_id, work_order_id, labor_time, assigned_tech_id, assigned_tech_id, punchable")
        .eq("shop_id", shopId)
        .in("work_order_id", ids);

      if (error) throw error;
      const rows = (data as WorkOrderLineSlim[]) ?? [];
      allLines.push(...rows);
    }

    // index lines by work_order_id for quick lookups
    const linesByWo = new Map<string, WorkOrderLineSlim[]>();
    for (const line of allLines) {
      const wo = line.work_order_id;
      if (!wo) continue;
      if (!linesByWo.has(wo)) linesByWo.set(wo, []);
      linesByWo.get(wo)!.push(line);
    }

    // compute billed hours per tech from the work orders attributed to that tech via invoice.tech_id
    for (const [techId, woSet] of workOrdersByTech.entries()) {
      const row = byTech.get(techId);
      if (!row) continue;

      let billed = 0;

      for (const woId of woSet.values()) {
        const lines = linesByWo.get(woId) ?? [];
        if (lines.length === 0) continue;

        // Prefer punchable lines if present, otherwise include all (shops vary)
        const punchableLines = lines.filter((l) => l.punchable === true);
        const candidateLines = punchableLines.length > 0 ? punchableLines : lines;

        // Primary: lines assigned to this tech (either field)
        const mine = candidateLines.filter(
          (l) => l.assigned_tech_id === techId || l.assigned_tech_id === techId,
        );
        const mineSum = mine.reduce((acc, l) => acc + safeNum(l.labor_time), 0);

        if (mineSum > 0) {
          billed += mineSum;
        } else {
          // Fallback: sum all lines on the WO (useful if assignment fields weren’t set)
          billed += candidateLines.reduce((acc, l) => acc + safeNum(l.labor_time), 0);
        }
      }

      row.billedHours += billed;
    }
  }

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