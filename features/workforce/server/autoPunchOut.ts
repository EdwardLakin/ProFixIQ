import { shopLocalDateTimeToUtc } from "@/features/shared/lib/utils/shopDayWindow";
import { getShopScheduleDateContext } from "@/features/workforce/lib/schedulePosture";

export type AutoPunchScheduleTemplate = {
  user_id: string;
  day_of_week: number;
  is_working_day: boolean;
  start_time: string | null;
  end_time: string | null;
  effective_from?: string | null;
  effective_to?: string | null;
};

export type AutoPunchScheduleOverride = {
  user_id: string;
  schedule_date: string;
  start_time: string | null;
  end_time: string | null;
  status: string | null;
};

function templateApplies(
  row: AutoPunchScheduleTemplate,
  dateKey: string,
  dayOfWeek: number,
) {
  return (
    row.day_of_week === dayOfWeek &&
    row.is_working_day &&
    Boolean(row.start_time && row.end_time) &&
    (!row.effective_from || row.effective_from <= dateKey) &&
    (!row.effective_to || row.effective_to >= dateKey)
  );
}

function timeOnly(value: string | null | undefined) {
  if (!value) return null;
  const match = /^(\d{2}:\d{2})(?::\d{2})?$/.exec(value);
  return match?.[1] ?? null;
}

function nextDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

export function resolveScheduledShiftEnd(params: {
  userId: string;
  shiftStartedAt: string;
  timezone?: string | null;
  templates: AutoPunchScheduleTemplate[];
  overrides: AutoPunchScheduleOverride[];
}): { scheduledEndIso: string; source: "override" | "template"; dateKey: string } | null {
  const startedAt = new Date(params.shiftStartedAt);
  if (!Number.isFinite(startedAt.getTime())) return null;

  const { dateKey, dayOfWeek } = getShopScheduleDateContext(
    startedAt,
    params.timezone,
  );
  const override = params.overrides.find(
    (row) =>
      row.user_id === params.userId &&
      row.schedule_date === dateKey &&
      String(row.status ?? "").toLowerCase() !== "cancelled",
  );

  // A same-day override is authoritative, including an explicit unscheduled day.
  if (override) {
    if (!override.start_time || !override.end_time) return null;
    const end = new Date(override.end_time);
    if (!Number.isFinite(end.getTime())) return null;
    return {
      scheduledEndIso: end.toISOString(),
      source: "override",
      dateKey,
    };
  }

  const template = params.templates.find(
    (row) =>
      row.user_id === params.userId &&
      templateApplies(row, dateKey, dayOfWeek),
  );
  const startTime = timeOnly(template?.start_time);
  const endTime = timeOnly(template?.end_time);
  if (!template || !startTime || !endTime) return null;

  const endDateKey = endTime <= startTime ? nextDateKey(dateKey) : dateKey;
  return {
    scheduledEndIso: shopLocalDateTimeToUtc(
      endDateKey,
      endTime,
      params.timezone,
    ),
    source: "template",
    dateKey,
  };
}
