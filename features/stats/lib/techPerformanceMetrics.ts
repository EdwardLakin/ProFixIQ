import type { TimeRange } from "@shared/lib/stats/getShopStats";
import type { TechLeaderboardRow } from "@shared/lib/stats/getTechLeaderboard";
import { shopLocalDateTimeToUtc } from "@/features/shared/lib/utils/shopDayWindow";

type Interval = {
  start: string | null;
  end: string | null;
  fallbackHours?: number | null;
  useNowWhenOpen?: boolean;
};

function normalizeTimezone(timezone?: string | null): string {
  const candidate = timezone?.trim();
  if (!candidate) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate });
    return candidate;
  } catch {
    return "UTC";
  }
}

function localDateKey(value: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function utcDateFromKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function dateKey(date: Date): string {
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function addToKey(key: string, amount: number, unit: "day" | "month"): string {
  const date = utcDateFromKey(key);
  if (unit === "day") date.setUTCDate(date.getUTCDate() + amount);
  else {
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + amount);
  }
  return dateKey(date);
}

export function getShopPerformanceRange(
  timeRange: TimeRange,
  timezone: string,
  now = new Date(),
): { start: string; endInclusive: string; endExclusive: string } {
  const safeTimezone = normalizeTimezone(timezone);
  const todayKey = localDateKey(now, safeTimezone);
  const startDate = utcDateFromKey(todayKey);

  if (timeRange === "weekly") {
    const weekday = startDate.getUTCDay();
    startDate.setUTCDate(startDate.getUTCDate() + (weekday === 0 ? -6 : 1 - weekday));
  } else if (timeRange === "monthly") {
    startDate.setUTCDate(1);
  } else if (timeRange === "quarterly") {
    startDate.setUTCDate(1);
    startDate.setUTCMonth(Math.floor(startDate.getUTCMonth() / 3) * 3);
  } else {
    startDate.setUTCMonth(0, 1);
  }

  const startKey = dateKey(startDate);
  const endKey =
    timeRange === "weekly"
      ? addToKey(startKey, 7, "day")
      : addToKey(
          startKey,
          timeRange === "monthly" ? 1 : timeRange === "quarterly" ? 3 : 12,
          "month",
        );

  return {
    start: shopLocalDateTimeToUtc(startKey, "00:00:00", safeTimezone),
    endInclusive: new Date(
      new Date(shopLocalDateTimeToUtc(endKey, "00:00:00", safeTimezone)).getTime() - 1,
    ).toISOString(),
    endExclusive: shopLocalDateTimeToUtc(endKey, "00:00:00", safeTimezone),
  };
}

export function mergedIntervalHours(
  intervals: Interval[],
  rangeStartIso: string,
  rangeEndIso: string,
  now = new Date(),
): number {
  const rangeStart = new Date(rangeStartIso).getTime();
  const rangeEnd = new Date(rangeEndIso).getTime();
  const normalized = intervals
    .flatMap((interval) => {
      if (!interval.start) return [];
      const start = new Date(interval.start).getTime();
      if (!Number.isFinite(start)) return [];
      const explicitEnd = interval.end ? new Date(interval.end).getTime() : Number.NaN;
      const fallbackEnd =
        start + Math.max(0, Number(interval.fallbackHours ?? 0)) * 60 * 60 * 1000;
      const end = Number.isFinite(explicitEnd)
        ? explicitEnd
        : fallbackEnd > start
          ? fallbackEnd
          : interval.useNowWhenOpen
            ? now.getTime()
            : Number.NaN;
      const clippedStart = Math.max(start, rangeStart);
      const clippedEnd = Math.min(end, rangeEnd);
      return clippedEnd > clippedStart ? [{ start: clippedStart, end: clippedEnd }] : [];
    })
    .sort((a, b) => a.start - b.start);

  let totalMs = 0;
  let currentStart = 0;
  let currentEnd = 0;
  for (const interval of normalized) {
    if (interval.start > currentEnd) {
      totalMs += Math.max(0, currentEnd - currentStart);
      currentStart = interval.start;
      currentEnd = interval.end;
    } else {
      currentEnd = Math.max(currentEnd, interval.end);
    }
  }
  totalMs += Math.max(0, currentEnd - currentStart);
  return totalMs / (60 * 60 * 1000);
}

export function derivePerformanceMetrics(row: TechLeaderboardRow): TechLeaderboardRow {
  row.clockedHours = row.attendanceHours;
  row.profit = row.revenue - row.laborCost;
  row.efficiencyPct =
    row.actualJobHours > 0 ? (row.flaggedHours / row.actualJobHours) * 100 : 0;
  row.productivityPct =
    row.attendanceHours > 0 ? (row.actualJobHours / row.attendanceHours) * 100 : 0;
  row.overallPerformancePct =
    row.attendanceHours > 0 ? (row.flaggedHours / row.attendanceHours) * 100 : 0;
  row.revenuePerHour = row.clockedHours > 0 ? row.revenue / row.clockedHours : 0;
  return row;
}
