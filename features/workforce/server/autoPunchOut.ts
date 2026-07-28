import { shopLocalDateTimeToUtc } from "@/features/shared/lib/utils/shopDayWindow";
import { getShopScheduleDateContext } from "@/features/workforce/lib/schedulePosture";

type ScheduleIdentity = {
  id?: string;
  shop_id: string;
  user_id: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type AutoPunchScheduleTemplate = ScheduleIdentity & {
  day_of_week: number;
  is_working_day: boolean;
  start_time: string | null;
  end_time: string | null;
  effective_from?: string | null;
  effective_to?: string | null;
};

export type AutoPunchScheduleOverride = ScheduleIdentity & {
  schedule_date: string;
  start_time: string | null;
  end_time: string | null;
  status: string | null;
};

export function isValidShopTimezone(timezone: string | null | undefined) {
  if (!timezone) return false;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

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

function addDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

function newestFirst<T extends ScheduleIdentity>(left: T, right: T) {
  const leftKey = `${left.updated_at ?? ""}|${left.created_at ?? ""}|${left.id ?? ""}`;
  const rightKey = `${right.updated_at ?? ""}|${right.created_at ?? ""}|${right.id ?? ""}`;
  return rightKey.localeCompare(leftKey);
}

function matchingOverrides(
  rows: AutoPunchScheduleOverride[],
  shopId: string,
  userId: string,
  dateKey: string,
) {
  return rows
    .filter(
      (row) =>
        row.shop_id === shopId &&
        row.user_id === userId &&
        row.schedule_date === dateKey &&
        String(row.status ?? "").toLowerCase() !== "cancelled",
    )
    .sort(newestFirst);
}

function matchingTemplates(
  rows: AutoPunchScheduleTemplate[],
  shopId: string,
  userId: string,
  dateKey: string,
  dayOfWeek: number,
) {
  return rows
    .filter(
      (row) =>
        row.shop_id === shopId &&
        row.user_id === userId &&
        templateApplies(row, dateKey, dayOfWeek),
    )
    .sort((left, right) => {
      const effective = String(right.effective_from ?? "").localeCompare(
        String(left.effective_from ?? ""),
      );
      return effective || newestFirst(left, right);
    });
}

function resolveTemplateOccurrence(
  row: AutoPunchScheduleTemplate,
  dateKey: string,
  timezone: string,
) {
  const startTime = timeOnly(row.start_time);
  const endTime = timeOnly(row.end_time);
  if (!startTime || !endTime) return null;
  const endDateKey = endTime <= startTime ? addDays(dateKey, 1) : dateKey;
  return {
    start: new Date(shopLocalDateTimeToUtc(dateKey, startTime, timezone)),
    end: new Date(shopLocalDateTimeToUtc(endDateKey, endTime, timezone)),
  };
}

export function getRelevantScheduleDateKeys(
  shiftStartedAt: string,
  timezone: string,
) {
  const startedAt = new Date(shiftStartedAt);
  if (!Number.isFinite(startedAt.getTime()) || !isValidShopTimezone(timezone)) {
    return [];
  }
  const { dateKey } = getShopScheduleDateContext(startedAt, timezone);
  return [dateKey, addDays(dateKey, -1)];
}

export function resolveScheduledShiftEnd(params: {
  shopId: string;
  userId: string;
  shiftStartedAt: string;
  timezone: string;
  templates: AutoPunchScheduleTemplate[];
  overrides: AutoPunchScheduleOverride[];
}): { scheduledEndIso: string; source: "override" | "template"; dateKey: string } | null {
  const startedAt = new Date(params.shiftStartedAt);
  if (
    !Number.isFinite(startedAt.getTime()) ||
    !isValidShopTimezone(params.timezone)
  ) {
    return null;
  }

  const { dateKey, dayOfWeek } = getShopScheduleDateContext(
    startedAt,
    params.timezone,
  );
  const previousDateKey = addDays(dateKey, -1);
  const previousDayOfWeek = (dayOfWeek + 6) % 7;

  // A late punch into an overnight occurrence belongs to the previous shop day.
  const previousOverride = matchingOverrides(
    params.overrides,
    params.shopId,
    params.userId,
    previousDateKey,
  ).find((row) => {
    if (!row.start_time || !row.end_time) return false;
    const start = new Date(row.start_time);
    const end = new Date(row.end_time);
    return (
      Number.isFinite(start.getTime()) &&
      Number.isFinite(end.getTime()) &&
      end > start &&
      startedAt >= start &&
      startedAt <= end
    );
  });
  if (previousOverride?.end_time) {
    return {
      scheduledEndIso: new Date(previousOverride.end_time).toISOString(),
      source: "override",
      dateKey: previousDateKey,
    };
  }

  const previousTemplate = matchingTemplates(
    params.templates,
    params.shopId,
    params.userId,
    previousDateKey,
    previousDayOfWeek,
  ).find((row) => {
    const occurrence = resolveTemplateOccurrence(
      row,
      previousDateKey,
      params.timezone,
    );
    return (
      occurrence &&
      occurrence.end > occurrence.start &&
      occurrence.end.toISOString().slice(0, 10) !== previousDateKey &&
      startedAt >= occurrence.start &&
      startedAt <= occurrence.end
    );
  });
  if (previousTemplate) {
    const occurrence = resolveTemplateOccurrence(
      previousTemplate,
      previousDateKey,
      params.timezone,
    );
    if (occurrence) {
      return {
        scheduledEndIso: occurrence.end.toISOString(),
        source: "template",
        dateKey: previousDateKey,
      };
    }
  }

  // A same-day override is authoritative, including an explicit unscheduled day.
  const override = matchingOverrides(
    params.overrides,
    params.shopId,
    params.userId,
    dateKey,
  )[0];
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

  const template = matchingTemplates(
    params.templates,
    params.shopId,
    params.userId,
    dateKey,
    dayOfWeek,
  )[0];
  if (!template) return null;
  const occurrence = resolveTemplateOccurrence(
    template,
    dateKey,
    params.timezone,
  );
  if (!occurrence || occurrence.end <= occurrence.start) return null;
  return {
    scheduledEndIso: occurrence.end.toISOString(),
    source: "template",
    dateKey,
  };
}
