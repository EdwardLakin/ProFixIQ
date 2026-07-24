export type WorkforceScheduleTemplate = {
  user_id: string;
  day_of_week: number;
  is_working_day: boolean;
  start_time: string | null;
  end_time: string | null;
  effective_from?: string | null;
  effective_to?: string | null;
};

export type WorkforceScheduleOverride = {
  user_id: string;
  schedule_date: string;
  start_time: string | null;
  end_time: string | null;
  status: string | null;
};

export type WorkforceSchedulePosture = {
  dateKey: string;
  dayOfWeek: number;
  scheduled: boolean;
  source: "override" | "template" | "none";
};

export function getShopScheduleDateContext(
  at: Date,
  timezone: string | null | undefined,
) {
  const fallback = "UTC";
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || fallback,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    });
  } catch {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: fallback,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    });
  }

  const parts = Object.fromEntries(
    formatter
      .formatToParts(at)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    parts.weekday ?? "",
  );

  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    dayOfWeek: weekday >= 0 ? weekday : at.getUTCDay(),
  };
}

function appliesOnDate(
  row: WorkforceScheduleTemplate,
  dateKey: string,
): boolean {
  return (
    (!row.effective_from || row.effective_from <= dateKey) &&
    (!row.effective_to || row.effective_to >= dateKey)
  );
}

export function resolveWorkforceSchedulePosture(params: {
  userId: string;
  at: Date;
  timezone?: string | null;
  templates: WorkforceScheduleTemplate[];
  overrides: WorkforceScheduleOverride[];
}): WorkforceSchedulePosture {
  const { dateKey, dayOfWeek } = getShopScheduleDateContext(
    params.at,
    params.timezone,
  );
  const override = params.overrides.find(
    (row) =>
      row.user_id === params.userId &&
      row.schedule_date === dateKey &&
      String(row.status ?? "").toLowerCase() !== "cancelled",
  );

  if (override) {
    return {
      dateKey,
      dayOfWeek,
      scheduled: Boolean(override.start_time && override.end_time),
      source: "override",
    };
  }

  const template = params.templates.find(
    (row) =>
      row.user_id === params.userId &&
      row.day_of_week === dayOfWeek &&
      appliesOnDate(row, dateKey),
  );

  return {
    dateKey,
    dayOfWeek,
    scheduled: Boolean(
      template?.is_working_day && template.start_time && template.end_time,
    ),
    source: template ? "template" : "none",
  };
}
