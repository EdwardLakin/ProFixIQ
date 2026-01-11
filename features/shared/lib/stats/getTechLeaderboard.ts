//features/shared/lib/stats/getTechLeaderboard.ts

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

  // match common variants
  if (r === "tech" || r === "technician" || r === "mechanic") return true;

  // match phrases
  if (r.includes("tech")) return true; // e.g. "lead tech", "diesel tech"
  if (r.includes("mechanic")) return true;

  return false;
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

  // 1) Pull ALL profiles in shop, then filter in JS (prevents role-case/variant mismatch)
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
    return {
      shop_id: shopId,
      start: startIso,
      end: endIso,
      rows: [],
    };
  }

  // 2) Invoices + timecards in range
  const [invoicesRes, timecardsRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, tech_id, shop_id, total, labor_cost, created_at")
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

  // 3) Aggregate per tech
  const byTech = new Map<string, TechLeaderboardRow>();

  // seed rows so techs show even with 0 activity
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

  for (const inv of invoices) {
    const techId = inv.tech_id;
    if (!techId) continue;
    const row = byTech.get(techId);
    if (!row) continue;

    const total = Number(inv.total ?? 0);
    const laborCost = Number(inv.labor_cost ?? 0);

    row.jobs += 1;
    row.revenue += Number.isFinite(total) ? total : 0;
    row.laborCost += Number.isFinite(laborCost) ? laborCost : 0;
  }

  for (const tc of timecards) {
    const techId = tc.user_id;
    if (!techId) continue;
    const row = byTech.get(techId);
    if (!row) continue;

    const hours = Number(tc.hours_worked ?? 0);
    row.clockedHours += Number.isFinite(hours) ? hours : 0;
  }

  for (const row of byTech.values()) {
    row.profit = row.revenue - row.laborCost;
    row.efficiencyPct = row.laborCost > 0 ? (row.revenue / row.laborCost) * 100 : 0;
    row.revenuePerHour = row.clockedHours > 0 ? row.revenue / row.clockedHours : 0;
  }

  const rows = Array.from(byTech.values()).sort((a, b) => b.revenue - a.revenue);

  return {
    shop_id: shopId,
    start: startIso,
    end: endIso,
    rows,
  };
}