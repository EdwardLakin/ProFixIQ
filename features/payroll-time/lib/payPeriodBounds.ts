export type PayrollCadence = "weekly" | "biweekly" | "semimonthly" | "monthly";

export const DEFAULT_BIWEEKLY_ANCHOR_DATE = "2024-01-01";

const DAY_MS = 24 * 60 * 60 * 1000;

export function isValidPayrollDateKey(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function atUtcDay(value: Date | string): Date {
  if (typeof value === "string" && !isValidPayrollDateKey(value)) {
    throw new Error("Invalid payroll date");
  }
  const date =
    value instanceof Date ? value : new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid payroll date");
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * DAY_MS);
}

export function calculatePayPeriodBounds(params: {
  shopDate: Date;
  cadence: PayrollCadence;
  weekStartsOn: number;
  anchorDate?: string | null;
}): { start: Date; end: Date } {
  const today = atUtcDay(params.shopDate);
  const weekStartsOn = Number.isInteger(params.weekStartsOn) && params.weekStartsOn >= 0 && params.weekStartsOn <= 6
    ? params.weekStartsOn
    : 1;
  const dayOffset = (today.getUTCDay() - weekStartsOn + 7) % 7;
  const weekStart = addUtcDays(today, -dayOffset);

  if (params.cadence === "weekly") {
    return { start: weekStart, end: addUtcDays(weekStart, 6) };
  }

  if (params.cadence === "biweekly") {
    const anchor = atUtcDay(
      params.anchorDate || DEFAULT_BIWEEKLY_ANCHOR_DATE,
    );
    const daysSinceAnchor = Math.floor((today.getTime() - anchor.getTime()) / DAY_MS);
    const cycle = Math.floor(daysSinceAnchor / 14);
    const start = addUtcDays(anchor, cycle * 14);
    return { start, end: addUtcDays(start, 13) };
  }

  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  if (params.cadence === "semimonthly") {
    if (today.getUTCDate() <= 15) {
      return {
        start: new Date(Date.UTC(year, month, 1)),
        end: new Date(Date.UTC(year, month, 15)),
      };
    }
    return {
      start: new Date(Date.UTC(year, month, 16)),
      end: new Date(Date.UTC(year, month + 1, 0)),
    };
  }

  return {
    start: new Date(Date.UTC(year, month, 1)),
    end: new Date(Date.UTC(year, month + 1, 0)),
  };
}
