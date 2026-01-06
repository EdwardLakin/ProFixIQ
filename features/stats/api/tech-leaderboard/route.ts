// features/stats/api/tech-leaderboard/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
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

import type { Database } from "@shared/types/types/supabase";
import type { TimeRange } from "@shared/lib/stats/getShopStats";
import type {
  TechLeaderboardResult,
  TechLeaderboardRow,
} from "@shared/lib/stats/getTechLeaderboard";

const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type Body = {
  shopId?: string;
  timeRange?: TimeRange;
};

function toIso(d: Date): string {
  return d.toISOString();
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    const shopId = body?.shopId;
    const timeRange = body?.timeRange ?? "monthly";

    if (!shopId) {
      return NextResponse.json({ error: "Missing shopId" }, { status: 400 });
    }

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

    // 1) tech profiles (don’t over-filter; roles can be messy)
    const { data: profiles, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, role, shop_id")
      .eq("shop_id", shopId);

    if (profErr) throw profErr;

    // Filter to “tech-ish” roles but tolerate casing/variants
    const techProfiles =
      (profiles ?? []).filter((p) => {
        const role = (p.role ?? "").toLowerCase();
        return role === "tech" || role === "technician" || role === "mechanic";
      }) ?? [];

    const techIds = techProfiles.map((p) => p.id).filter(Boolean);

    if (techIds.length === 0) {
      const empty: TechLeaderboardResult = {
        shop_id: shopId,
        start: startIso,
        end: endIso,
        rows: [],
      };
      return NextResponse.json(empty);
    }

    // 2) invoices + timecards
    const [invoicesRes, timecardsRes] = await Promise.all([
      supabaseAdmin
        .from("invoices")
        .select("id, tech_id, shop_id, total, labor_cost, created_at")
        .eq("shop_id", shopId)
        .in("tech_id", techIds)
        .gte("created_at", startIso)
        .lt("created_at", endExclusiveIso),

      supabaseAdmin
        .from("payroll_timecards")
        .select("id, user_id, shop_id, clock_in, clock_out, hours_worked, created_at")
        .eq("shop_id", shopId)
        .in("user_id", techIds)
        .gte("clock_in", startIso)
        .lt("clock_in", endExclusiveIso),
    ]);

    if (invoicesRes.error) throw invoicesRes.error;
    if (timecardsRes.error) throw timecardsRes.error;

    const invoices = invoicesRes.data ?? [];
    const timecards = timecardsRes.data ?? [];

    // 3) aggregate
    const byTech = new Map<string, TechLeaderboardRow>();

    for (const prof of techProfiles) {
      byTech.set(prof.id, {
        techId: prof.id,
        name: prof.full_name || "Unnamed tech",
        role: prof.role ?? null,
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

    const result: TechLeaderboardResult = {
      shop_id: shopId,
      start: startIso,
      end: endIso,
      rows: Array.from(byTech.values()).sort((a, b) => b.revenue - a.revenue),
    };

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // eslint-disable-next-line no-console
    console.error("[tech-leaderboard] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}