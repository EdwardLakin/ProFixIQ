import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import { isTechRole } from "@shared/lib/stats/getTechLeaderboard";
import { getShopLocalDayWindow } from "@shared/lib/utils/shopDayWindow";

type DB = Database;

type ProfileLite = Pick<
  DB["public"]["Tables"]["profiles"]["Row"],
  "id" | "full_name" | "role" | "shop_id"
>;

type ShiftLite = Pick<
  DB["public"]["Tables"]["tech_shifts"]["Row"],
  "id" | "user_id" | "shop_id" | "start_time" | "end_time"
>;

type PunchLite = Pick<
  DB["public"]["Tables"]["punch_events"]["Row"],
  "shift_id" | "timestamp" | "event_type"
>;

type LineLite = Pick<
  DB["public"]["Tables"]["work_order_lines"]["Row"],
  "id" | "shop_id" | "assigned_tech_id" | "punched_in_at" | "punched_out_at"
>;

type ShopTimezoneLite = Pick<DB["public"]["Tables"]["shops"]["Row"], "timezone">;

export type TechnicianIdleBreakdown = {
  availableIdleSeconds: number;
  untrackedSeconds: number;
};

export type TechnicianLoadMetricRow = {
  techId: string;
  name: string;
  role: string | null;
  activeSecondsToday: number;
  shiftSecondsToday: number;
  workedSecondsToday: number;
  idleSecondsToday: number;
  idleBreakdown: TechnicianIdleBreakdown;
  completedJobsToday: number;
  avgJobDurationSeconds: number;
  currentActiveJobs: number;
  utilizationPct: number;
};

export type TechnicianLoadMetricSummary = {
  totalActiveJobs: number;
  totalTechnicians: number;
  activeTechnicians: number;
  totalShiftSeconds: number;
  totalActiveSeconds: number;
  shopUtilizationPct: number;
};

export type TechnicianLoadMetricResult = {
  shopId: string;
  timezone: string;
  localDayKey: string;
  dayStartIso: string;
  dayEndIso: string;
  rows: TechnicianLoadMetricRow[];
  summary: TechnicianLoadMetricSummary;
};

function clampOverlapSeconds(
  startIso: string | null,
  endIso: string | null,
  windowStartMs: number,
  windowEndMs: number,
  nowMs: number,
): number {
  if (!startIso) return 0;

  const startMs = new Date(startIso).getTime();
  const rawEndMs = endIso ? new Date(endIso).getTime() : nowMs;

  if (!Number.isFinite(startMs) || !Number.isFinite(rawEndMs)) return 0;

  const s = Math.max(startMs, windowStartMs);
  const e = Math.min(rawEndMs, windowEndMs);
  if (e <= s) return 0;

  return Math.round((e - s) / 1000);
}

function computeBreakSecondsForShift(
  punches: PunchLite[],
  windowStartMs: number,
  windowEndMs: number,
  nowMs: number,
): number {
  if (punches.length === 0) return 0;

  let total = 0;
  let breakStart: string | null = null;
  let lunchStart: string | null = null;

  const ordered = [...punches].sort(
    (a, b) => new Date(a.timestamp ?? 0).getTime() - new Date(b.timestamp ?? 0).getTime(),
  );

  for (const punch of ordered) {
    const type = punch.event_type;
    if (!type || !punch.timestamp) continue;

    if (type === "break_start") breakStart = punch.timestamp;
    if (type === "break_end" && breakStart) {
      total += clampOverlapSeconds(
        breakStart,
        punch.timestamp,
        windowStartMs,
        windowEndMs,
        nowMs,
      );
      breakStart = null;
    }

    if (type === "lunch_start") lunchStart = punch.timestamp;
    if (type === "lunch_end" && lunchStart) {
      total += clampOverlapSeconds(
        lunchStart,
        punch.timestamp,
        windowStartMs,
        windowEndMs,
        nowMs,
      );
      lunchStart = null;
    }
  }

  if (breakStart) {
    total += clampOverlapSeconds(breakStart, null, windowStartMs, windowEndMs, nowMs);
  }
  if (lunchStart) {
    total += clampOverlapSeconds(lunchStart, null, windowStartMs, windowEndMs, nowMs);
  }

  return total;
}

export async function getTechnicianLoadMetricsWithClient(
  supabase: SupabaseClient<DB>,
  shopId: string,
): Promise<TechnicianLoadMetricResult> {
  const now = new Date();
  const nowMs = now.getTime();

  const { data: shopData, error: shopError } = await supabase
    .from("shops")
    .select("timezone")
    .eq("id", shopId)
    .single();

  if (shopError) throw shopError;

  const timezone = ((shopData as ShopTimezoneLite | null)?.timezone ?? "UTC").trim() || "UTC";
  const dayWindow = getShopLocalDayWindow(timezone, now);
  const dayStartIso = dayWindow.dayStartIso;
  const dayEndIso = dayWindow.dayEndIso;
  const dayStartMs = dayWindow.dayStartMs;
  const dayEndMs = dayWindow.dayEndMs;

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, role, shop_id")
    .eq("shop_id", shopId);

  if (profileError) throw profileError;

  const techProfiles: ProfileLite[] = (profiles ?? []).filter((p) => isTechRole(p.role));
  const techIds = techProfiles.map((p) => p.id).filter(Boolean);

  if (techIds.length === 0) {
    return {
      shopId,
      timezone,
      localDayKey: dayWindow.localDayKey,
      dayStartIso,
      dayEndIso,
      rows: [],
      summary: {
        totalActiveJobs: 0,
        totalTechnicians: 0,
        activeTechnicians: 0,
        totalShiftSeconds: 0,
        totalActiveSeconds: 0,
        shopUtilizationPct: 0,
      },
    };
  }

  const [linesRes, shiftsRes] = await Promise.all([
    supabase
      .from("work_order_lines")
      .select("id, shop_id, assigned_tech_id, punched_in_at, punched_out_at")
      .eq("shop_id", shopId)
      .in("assigned_tech_id", techIds)
      .lt("punched_in_at", dayEndIso)
      .or(`punched_out_at.gte.${dayStartIso},punched_out_at.is.null`),
    supabase
      .from("tech_shifts")
      .select("id, user_id, shop_id, start_time, end_time")
      .eq("shop_id", shopId)
      .in("user_id", techIds)
      .lt("start_time", dayEndIso)
      .or(`end_time.is.null,end_time.gte.${dayStartIso}`),
  ]);

  if (linesRes.error) throw linesRes.error;
  if (shiftsRes.error) throw shiftsRes.error;

  const shifts = (shiftsRes.data as ShiftLite[] | null) ?? [];
  const shiftIds = shifts.map((s) => s.id).filter(Boolean);

  let punches: PunchLite[] = [];
  if (shiftIds.length > 0) {
    const punchRes = await supabase
      .from("punch_events")
      .select("shift_id, timestamp, event_type")
      .in("shift_id", shiftIds);

    if (punchRes.error) throw punchRes.error;
    punches = (punchRes.data as PunchLite[] | null) ?? [];
  }

  const rowsByTech = new Map<string, TechnicianLoadMetricRow>(
    techProfiles.map((p) => [
      p.id,
      {
        techId: p.id,
        name: p.full_name ?? "Unnamed tech",
        role: p.role,
        activeSecondsToday: 0,
        shiftSecondsToday: 0,
        workedSecondsToday: 0,
        idleSecondsToday: 0,
        idleBreakdown: {
          availableIdleSeconds: 0,
          untrackedSeconds: 0,
        },
        completedJobsToday: 0,
        avgJobDurationSeconds: 0,
        currentActiveJobs: 0,
        utilizationPct: 0,
      },
    ]),
  );

  const durationTotals = new Map<string, { totalSeconds: number; count: number }>();

  for (const line of (linesRes.data as LineLite[] | null) ?? []) {
    const techId = line.assigned_tech_id;
    if (!techId) continue;
    const row = rowsByTech.get(techId);
    if (!row) continue;

    const activeSeconds = clampOverlapSeconds(
      line.punched_in_at,
      line.punched_out_at,
      dayStartMs,
      dayEndMs,
      nowMs,
    );

    row.activeSecondsToday += activeSeconds;

    if (line.punched_in_at && !line.punched_out_at) {
      row.currentActiveJobs += 1;
    }

    if (line.punched_in_at && line.punched_out_at) {
      const outMs = new Date(line.punched_out_at).getTime();
      const inMs = new Date(line.punched_in_at).getTime();

      if (
        outMs >= dayStartMs &&
        outMs < dayEndMs &&
        Number.isFinite(inMs) &&
        Number.isFinite(outMs) &&
        outMs > inMs
      ) {
        row.completedJobsToday += 1;

        const item = durationTotals.get(techId) ?? { totalSeconds: 0, count: 0 };
        item.totalSeconds += clampOverlapSeconds(
          line.punched_in_at,
          line.punched_out_at,
          dayStartMs,
          dayEndMs,
          nowMs,
        );
        item.count += 1;
        durationTotals.set(techId, item);
      }
    }
  }

  const punchesByShiftId = new Map<string, PunchLite[]>();
  for (const punch of punches) {
    if (!punch.shift_id) continue;
    const list = punchesByShiftId.get(punch.shift_id) ?? [];
    list.push(punch);
    punchesByShiftId.set(punch.shift_id, list);
  }

  for (const shift of shifts) {
    const techId = shift.user_id;
    if (!techId) continue;
    const row = rowsByTech.get(techId);
    if (!row) continue;

    const shiftSeconds = clampOverlapSeconds(
      shift.start_time,
      shift.end_time,
      dayStartMs,
      dayEndMs,
      nowMs,
    );

    const breakSeconds = computeBreakSecondsForShift(
      punchesByShiftId.get(shift.id) ?? [],
      dayStartMs,
      dayEndMs,
      nowMs,
    );

    const netShiftSeconds = Math.max(0, shiftSeconds - breakSeconds);
    row.shiftSecondsToday += netShiftSeconds;
    row.workedSecondsToday = row.shiftSecondsToday;
  }

  for (const row of rowsByTech.values()) {
    const totals = durationTotals.get(row.techId);
    row.avgJobDurationSeconds =
      totals && totals.count > 0 ? Math.round(totals.totalSeconds / totals.count) : 0;

    const idle = row.shiftSecondsToday - row.activeSecondsToday;
    row.idleSecondsToday = Math.max(0, idle);
    row.idleBreakdown.availableIdleSeconds = row.idleSecondsToday;
    row.idleBreakdown.untrackedSeconds = 0;

    row.utilizationPct =
      row.shiftSecondsToday > 0
        ? Math.round(
            (Math.min(row.activeSecondsToday, row.shiftSecondsToday) / row.shiftSecondsToday) *
              100,
          )
        : 0;
  }

  const sortedRows = Array.from(rowsByTech.values()).sort(
    (a, b) => b.activeSecondsToday - a.activeSecondsToday,
  );

  const totalActiveJobs = sortedRows.reduce((sum, row) => sum + row.currentActiveJobs, 0);
  const totalShiftSeconds = sortedRows.reduce((sum, row) => sum + row.shiftSecondsToday, 0);
  const totalActiveSeconds = sortedRows.reduce((sum, row) => sum + row.activeSecondsToday, 0);

  return {
    shopId,
    timezone,
    localDayKey: dayWindow.localDayKey,
    dayStartIso,
    dayEndIso,
    rows: sortedRows,
    summary: {
      totalActiveJobs,
      totalTechnicians: sortedRows.length,
      activeTechnicians: sortedRows.filter((row) => row.currentActiveJobs > 0).length,
      totalShiftSeconds,
      totalActiveSeconds,
      shopUtilizationPct:
        totalShiftSeconds > 0
          ? Math.round((Math.min(totalActiveSeconds, totalShiftSeconds) / totalShiftSeconds) * 100)
          : 0,
    },
  };
}
