const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

export function isValidScheduleDateKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = DATE_KEY_PATTERN.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));

  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

export function addScheduleDateKeyDays(
  dateKey: string,
  days: number,
): string {
  if (!isValidScheduleDateKey(dateKey) || !Number.isInteger(days)) {
    throw new Error("A valid schedule date and whole-day offset are required");
  }
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function scheduleDateKeyDistance(
  fromDateKey: string,
  toDateKey: string,
): number | null {
  if (
    !isValidScheduleDateKey(fromDateKey) ||
    !isValidScheduleDateKey(toDateKey)
  ) {
    return null;
  }
  return Math.round(
    (new Date(`${toDateKey}T00:00:00.000Z`).getTime() -
      new Date(`${fromDateKey}T00:00:00.000Z`).getTime()) /
      (24 * 60 * 60 * 1000),
  );
}

export function normalizeScheduleClockTime(
  value: unknown,
): string | null | undefined {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const match = CLOCK_TIME_PATTERN.exec(value.trim());
  if (!match) return undefined;
  return `${match[1]}:${match[2]}:${match[3] ?? "00"}`;
}

export function scheduleClockMinutes(value: string): number {
  const match = CLOCK_TIME_PATTERN.exec(value);
  if (!match) return Number.NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function normalizeUnpaidBreakMinutes(
  value: unknown,
): number | undefined {
  const minutes = Number(value ?? 0);
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 24 * 60) {
    return undefined;
  }
  return minutes;
}
