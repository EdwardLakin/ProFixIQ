// @shared/lib/stats/getTechLeaderboard.ts

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

type DB = Database;

type SlimProfile = {
  id: string;
  full_name: string | null;
  role: string | null;
  shop_id: string | null;
};

type InvoiceRow = DB["public"]["Tables"]["invoices"]["Row"];
type TimecardRow = DB["public"]["Tables"]["payroll_timecards"]["Row"];

export type TechLeaderboardRow = {
  techId: string;
  name: string;
  role: string | null;

  jobs: number;
  revenue: number; // invoices.total
  laborCost: number; // invoices.labor_cost
  profit: number; // revenue - laborCost

  billedHours: number, 
  clockedHours: number; // payroll_timecards.hours_worked
  revenuePerHour: number; // revenue / clockedHours
  efficiencyPct: number; // revenue / laborCost * 100 (if laborCost > 0)
};

export type TechLeaderboardResult = {
  shop_id: string;
  start: string;
  end: string;
  rows: TechLeaderboardRow[];
};

/**
 * Per-tech leaderboard for a shop over a time window.
 * Pulls from:
 *   - public.invoices            (revenue, labor_cost, tech_id)
 *   - public.payroll_timecards   (hours_worked, user_id)
 */
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

  const startIso = start.toISOString();
  const endIso = end.toISOString();

  // 1) Tech profiles in this shop
  const TECH_ROLES: string[] = [
    "tech",
    "technician",
    "lead_hand",
    "lead",
    "shop_foreman",
    "apprentice",
  ];

  const { data: profiles, error: profErr } = await supabase
    .from("profiles")
    .select("id, full_name, role, shop_id")
    .eq("shop_id", shopId);

  if (profErr) throw profErr;

  // Map to a narrow type matching only the selected columns
  const techProfiles: SlimProfile[] =
    (profiles ?? [])
      .filter((p) => (p.role ? TECH_ROLES.includes(p.role) : false))
      .map((p) => ({
        id: p.id,
        full_name: p.full_name ?? null,
        role: p.role ?? null,
        shop_id: p.shop_id ?? null,
      }));

  const techIds = techProfiles.map((p) => p.id);

  if (techIds.length === 0) {
    return {
      shop_id: shopId,
      start: startIso,
      end: endIso,
      rows: [],
    };
  }

  // 2) Invoices in range, for this shop + these techs
  const [invoicesRes, timecardsRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("*")
      .eq("shop_id", shopId)
      .in("tech_id", techIds)
      .gte("created_at", startIso)
      .lte("created_at", endIso),
    supabase
      .from("payroll_timecards")
      .select("*")
      .eq("shop_id", shopId)
      .in("user_id", techIds)
      .gte("clock_in", startIso)
      .lte("clock_in", endIso),
  ]);

  if (invoicesRes.error) throw invoicesRes.error;
  if (timecardsRes.error) throw timecardsRes.error;

  const invoices: InvoiceRow[] = invoicesRes.data ?? [];
  const timecards: TimecardRow[] = timecardsRes.data ?? [];

  // 3) Aggregate per tech
  const byTech = new Map<string, TechLeaderboardRow>();

  // Seed with zero rows for each tech so they always show
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

  // Aggregate invoices
  for (const inv of invoices) {
    const techId = inv.tech_id;
    if (!techId || !byTech.has(techId)) continue;

    const row = byTech.get(techId)!;
    const total = Number(inv.total ?? 0);
    const laborCost = Number(inv.labor_cost ?? 0);

    row.jobs += 1;
    row.revenue += Number.isFinite(total) ? total : 0;
    row.laborCost += Number.isFinite(laborCost) ? laborCost : 0;
  }

  // Aggregate timecards
  for (const tc of timecards) {
    const techId = tc.user_id;
    if (!techId || !byTech.has(techId)) continue;

    const row = byTech.get(techId)!;
    const hours = Number(tc.hours_worked ?? 0);

    row.clockedHours += Number.isFinite(hours) ? hours : 0;
  }

  // 4) Finalize profit / ratios
  for (const row of byTech.values()) {
    row.profit = row.revenue - row.laborCost;

    if (row.laborCost > 0) {
      row.efficiencyPct = (row.revenue / row.laborCost) * 100;
    } else {
      row.efficiencyPct = 0;
    }

    if (row.clockedHours > 0) {
      row.revenuePerHour = row.revenue / row.clockedHours;
    } else {
      row.revenuePerHour = 0;
    }
  }

  const rows = Array.from(byTech.values()).sort(
    (a, b) => b.revenue - a.revenue,
  );

  return {
    shop_id: shopId,
    start: startIso,
    end: endIso,
    rows,
  };
}