export type ShopLocalDayWindow = {
  timezone: string;
  localDayKey: string;
  dayStartIso: string;
  dayEndIso: string;
  dayStartMs: number;
  dayEndMs: number;
};

type LocalDateParts = {
  year: number;
  month: number;
  day: number;
};

function getLocalDateParts(date: Date, timeZone: string): LocalDateParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")?.value ?? "");
  const month = Number(parts.find((p) => p.type === "month")?.value ?? "");
  const day = Number(parts.find((p) => p.type === "day")?.value ?? "");

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    throw new Error(`Unable to resolve local date parts for timezone: ${timeZone}`);
  }

  return { year, month, day };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")?.value ?? "");
  const month = Number(parts.find((p) => p.type === "month")?.value ?? "");
  const day = Number(parts.find((p) => p.type === "day")?.value ?? "");
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "");
  const second = Number(parts.find((p) => p.type === "second")?.value ?? "");

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second)
  ) {
    return 0;
  }

  const asUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  return asUtcMs - date.getTime();
}

function zonedDateTimeToUtcMs(
  parts: { year: number; month: number; day: number; hour: number; minute: number; second: number },
  timeZone: string,
): number {
  const guessMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  let utcMs = guessMs - getTimeZoneOffsetMs(new Date(guessMs), timeZone);

  // Re-run once using the updated UTC instant so DST boundaries resolve correctly.
  utcMs = guessMs - getTimeZoneOffsetMs(new Date(utcMs), timeZone);
  return utcMs;
}

export function shopLocalDateTimeToUtc(
  dateKey: string,
  timeValue: string,
  timezone?: string | null,
): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  const time = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(timeValue);
  if (!match || !time) throw new Error("Invalid shop-local date or time");
  const safeTimezone = normalizeTimezone(timezone);
  const utcMs = zonedDateTimeToUtcMs({
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(time[1]),
    minute: Number(time[2]),
    second: Number(time[3] ?? 0),
  }, safeTimezone);
  return new Date(utcMs).toISOString();
}

export function getShopLocalDayWindow(
  timezone: string,
  referenceDate: Date = new Date(),
): ShopLocalDayWindow {
  const local = getLocalDateParts(referenceDate, timezone);

  const dayStartMs = zonedDateTimeToUtcMs(
    {
      year: local.year,
      month: local.month,
      day: local.day,
      hour: 0,
      minute: 0,
      second: 0,
    },
    timezone,
  );

  const nextDayUtc = new Date(Date.UTC(local.year, local.month - 1, local.day + 1, 0, 0, 0));
  const nextLocal = {
    year: nextDayUtc.getUTCFullYear(),
    month: nextDayUtc.getUTCMonth() + 1,
    day: nextDayUtc.getUTCDate(),
  };

  const dayEndMs = zonedDateTimeToUtcMs(
    {
      year: nextLocal.year,
      month: nextLocal.month,
      day: nextLocal.day,
      hour: 0,
      minute: 0,
      second: 0,
    },
    timezone,
  );

  return {
    timezone,
    localDayKey: `${String(local.year).padStart(4, "0")}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}`,
    dayStartIso: new Date(dayStartMs).toISOString(),
    dayEndIso: new Date(dayEndMs).toISOString(),
    dayStartMs,
    dayEndMs,
  };
}

function normalizeTimezone(timezone?: string | null): string {
  if (!timezone) return "UTC";
  try {
    // Throws for invalid IANA timezone names.
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return timezone;
  } catch {
    return "UTC";
  }
}

export function getShopDayRange(
  timezone?: string | null,
  referenceDate: Date = new Date(),
): { timezone: string; start: string; end: string } {
  const safeTimezone = normalizeTimezone(timezone);
  const window = getShopLocalDayWindow(safeTimezone, referenceDate);
  return {
    timezone: safeTimezone,
    start: window.dayStartIso,
    end: window.dayEndIso,
  };
}

export function getShopTodayTomorrowRanges(
  timezone?: string | null,
  now: Date = new Date(),
): {
  timezone: string;
  today: { start: string; end: string };
  tomorrow: { start: string; end: string };
} {
  const today = getShopDayRange(timezone, now);
  const tomorrow = getShopDayRange(today.timezone, new Date(today.end));
  return {
    timezone: today.timezone,
    today: { start: today.start, end: today.end },
    tomorrow: { start: tomorrow.start, end: tomorrow.end },
  };
}
