export type PayrollCadence = "weekly" | "biweekly" | "semimonthly" | "monthly";

const DAY_MS = 24 * 60 * 60 * 1000;

function atUtcDay(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00.000Z`);
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
    const anchor = atUtcDay(params.anchorDate || "2024-01-01");
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
