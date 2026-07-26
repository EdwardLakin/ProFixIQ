import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  derivePerformanceMetrics,
  getShopPerformanceRange,
  mergedIntervalHours,
} from "@/features/stats/lib/techPerformanceMetrics";
import type { TimeRange } from "@shared/lib/stats/getShopStats";
import {
  isTechRole,
  type TechLeaderboardResult,
  type TechLeaderboardRow,
} from "@shared/lib/stats/getTechLeaderboard";

type Body = {
  shopId?: string;
  timeRange?: TimeRange;
  technicianId?: string;
};

type SlimProfile = {
  id: string;
  full_name: string | null;
  role: string | null;
  shop_id: string | null;
};

type InvoiceSlim = {
  id: string;
  tech_id: string | null;
  total: number | null;
  labor_cost: number | null;
};

type ShiftSlim = {
  user_id: string | null;
  start_time: string | null;
  end_time: string | null;
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

type TimecardSlim = {
  user_id: string | null;
  clock_in: string;
  clock_out: string | null;
  hours_worked: number | null;
};

function safeNum(value: number | null | undefined): number {
  const n = Number(value ?? 0);
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

  const endMs = endedAt ? new Date(endedAt).getTime() : Date.now();
  if (!Number.isFinite(endMs)) return 0;

  const windowStart = new Date(rangeStartIso).getTime();
  const windowEnd = new Date(rangeEndIso).getTime();
  const overlapMs = Math.min(endMs, windowEnd) - Math.max(startMs, windowStart);
  return overlapMs > 0 ? overlapMs / (1000 * 60 * 60) : 0;
}

export async function POST(req: Request) {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;

  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    const requestedShopId = body?.shopId ?? access.profile.shop_id;
    const timeRange = body?.timeRange ?? "weekly";
    const technicianId = body?.technicianId?.trim() || undefined;

    if (requestedShopId !== access.profile.shop_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminSupabase();
    const { data: shop, error: shopError } = await admin
      .from("shops")
      .select("timezone")
      .eq("id", requestedShopId)
      .maybeSingle();
    if (shopError) throw shopError;
    const {
      start: startIso,
      endInclusive: endIso,
      endExclusive: endExclusiveIso,
    } = getShopPerformanceRange(timeRange, shop?.timezone);

    let profilesQuery = admin
      .from("profiles")
      .select("id, full_name, role, shop_id")
      .eq("shop_id", requestedShopId);
    if (technicianId) profilesQuery = profilesQuery.eq("id", technicianId);

    const { data: profiles, error: profilesError } = await profilesQuery;
    if (profilesError) throw profilesError;

    const techProfiles: SlimProfile[] = ((profiles ?? []) as SlimProfile[])
      .filter((profile) => profile.shop_id === requestedShopId)
      .filter((profile) => isTechRole(profile.role));

    const techIds = techProfiles.map((profile) => profile.id).filter(Boolean);
    if (techIds.length === 0) {
      return NextResponse.json({
        shop_id: requestedShopId,
        start: startIso,
        end: endIso,
        rows: [],
      } satisfies TechLeaderboardResult);
    }

    const [
      invoicesRes,
      shiftsRes,
      segmentsRes,
      creditsRes,
      timecardsRes,
    ] = await Promise.all([
      admin
        .from("invoices")
        .select("id, tech_id, total, labor_cost")
        .eq("shop_id", requestedShopId)
        .in("tech_id", techIds)
        .gte("created_at", startIso)
        .lt("created_at", endExclusiveIso),

      admin
        .from("tech_shifts")
        .select("user_id, start_time, end_time")
        .eq("shop_id", requestedShopId)
        .in("user_id", techIds)
        .eq("type", "shift")
        .neq("excluded_from_payroll", true)
        .lt("start_time", endExclusiveIso)
        .or(`end_time.is.null,end_time.gt.${startIso}`),

      admin
        .from("work_order_line_labor_segments")
        .select("technician_id, started_at, ended_at")
        .eq("shop_id", requestedShopId)
        .in("technician_id", techIds)
        .lt("started_at", endExclusiveIso)
        .or(`ended_at.is.null,ended_at.gt.${startIso}`),

      admin
        .from("work_order_line_flat_rate_credits")
        .select("technician_id, work_order_line_id, credit_hours")
        .eq("shop_id", requestedShopId)
        .in("technician_id", techIds)
        .gte("credited_at", startIso)
        .lt("credited_at", endExclusiveIso),

      admin
        .from("payroll_timecards")
        .select("user_id, clock_in, clock_out, hours_worked")
        .eq("shop_id", requestedShopId)
        .in("user_id", techIds)
        .lt("clock_in", endExclusiveIso)
        .or(`clock_out.is.null,clock_out.gt.${startIso}`),
    ]);

    if (invoicesRes.error) throw invoicesRes.error;
    if (shiftsRes.error) throw shiftsRes.error;
    if (segmentsRes.error) throw segmentsRes.error;
    if (creditsRes.error) throw creditsRes.error;
    if (timecardsRes.error) throw timecardsRes.error;

    const byTech = new Map<string, TechLeaderboardRow>();
    for (const profile of techProfiles) {
      byTech.set(profile.id, {
        techId: profile.id,
        name: profile.full_name || "Unnamed tech",
        role: profile.role,
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

    for (const invoice of ((invoicesRes.data ?? []) as InvoiceSlim[])) {
      if (!invoice.tech_id) continue;
      const row = byTech.get(invoice.tech_id);
      if (!row) continue;
      row.revenue += safeNum(invoice.total);
      row.laborCost += safeNum(invoice.labor_cost);
    }

    for (const segment of ((segmentsRes.data ?? []) as LaborSegmentSlim[])) {
      if (!segment.technician_id) continue;
      const row = byTech.get(segment.technician_id);
      if (!row) continue;
      row.actualJobHours += getOverlapHours(
        segment.started_at,
        segment.ended_at,
        startIso,
        endExclusiveIso,
      );
    }

    const creditedLines = new Map<string, Set<string>>();
    for (const credit of ((creditsRes.data ?? []) as FlatRateCreditSlim[])) {
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

    for (const row of byTech.values()) {
      const shifts = ((shiftsRes.data ?? []) as ShiftSlim[])
        .filter((shift) => shift.user_id === row.techId)
        .map((shift) => ({
          start: shift.start_time,
          end: shift.end_time,
          useNowWhenOpen: true,
        }));
      const timecards = ((timecardsRes.data ?? []) as TimecardSlim[])
        .filter((timecard) => timecard.user_id === row.techId)
        .map((timecard) => ({
          start: timecard.clock_in,
          end: timecard.clock_out,
          fallbackHours: timecard.hours_worked,
        }));
      row.attendanceHours = mergedIntervalHours(
        [...shifts, ...timecards],
        startIso,
        endExclusiveIso,
      );
      derivePerformanceMetrics(row);
    }

    const result: TechLeaderboardResult = {
      shop_id: requestedShopId,
      start: startIso,
      end: endIso,
      rows: Array.from(byTech.values()).sort((a, b) => b.revenue - a.revenue),
    };

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[tech-leaderboard] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
