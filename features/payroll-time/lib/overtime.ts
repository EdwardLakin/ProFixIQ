export type OvertimeRow = {
  user_id: string;
  work_date: string;
  regular_minutes: number;
  overtime_minutes: number;
};

function shopWeekKey(dateKey: string, weekStartsOn: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  const offset = (date.getUTCDay() - weekStartsOn + 7) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

/**
 * Moves only daily-regular minutes above the weekly threshold into overtime.
 * Daily overtime is left untouched, so the same minute can never be counted twice.
 */
export function applyWeeklyOvertime<T extends OvertimeRow>(
  rows: T[],
  weeklyThresholdMinutes: number,
  weekStartsOn: number,
): T[] {
  if (weeklyThresholdMinutes <= 0) return rows;

  const running = new Map<string, number>();
  return [...rows]
    .sort((a, b) => a.user_id.localeCompare(b.user_id) || a.work_date.localeCompare(b.work_date))
    .map((row) => {
      const key = `${row.user_id}:${shopWeekKey(row.work_date, weekStartsOn)}`;
      const before = running.get(key) ?? 0;
      const after = before + row.regular_minutes;
      const weeklyOvertime = Math.min(
        row.regular_minutes,
        Math.max(0, after - weeklyThresholdMinutes),
      );
      running.set(key, after);
      return {
        ...row,
        regular_minutes: row.regular_minutes - weeklyOvertime,
        overtime_minutes: row.overtime_minutes + weeklyOvertime,
      };
    });
}
