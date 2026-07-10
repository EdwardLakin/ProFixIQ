export const SHIFT_STATUSES = {
  active: "active",
  completed: "completed",
  // Back-compat aliases for older call sites. Do not write these literal names to the DB.
  open: "active",
  closed: "completed",
} as const;

export type ShiftStatus = "active" | "completed";

export const PUNCH_EVENT_TYPES = {
  startShift: "start_shift",
  breakStart: "break_start",
  breakEnd: "break_end",
  lunchStart: "lunch_start",
  lunchEnd: "lunch_end",
  endShift: "end_shift",
} as const;

export type PunchEventType = (typeof PUNCH_EVENT_TYPES)[keyof typeof PUNCH_EVENT_TYPES];

export const SHIFT_ACTIVITIES = {
  offShift: "off_shift",
  working: "working",
  onBreak: "on_break",
  onLunch: "on_lunch",
} as const;

export type ShiftActivity = (typeof SHIFT_ACTIVITIES)[keyof typeof SHIFT_ACTIVITIES];

export type ShiftEventLike = {
  event_type?: string | null;
  timestamp?: string | null;
  created_at?: string | null;
};

export type ShiftStateDto = {
  shiftId: string | null;
  shiftStatus: ShiftStatus | null;
  activity: ShiftActivity;
  startTime: string | null;
  endTime: string | null;
  latestEventType: PunchEventType | null;
  latestEventAt: string | null;
};

const EVENT_TYPE_VALUES = new Set<string>(Object.values(PUNCH_EVENT_TYPES));

export function isActiveShiftStatus(status: string | null | undefined): status is "active" {
  return status === SHIFT_STATUSES.active;
}

export function isCompletedShiftStatus(status: string | null | undefined): status is "completed" {
  return status === SHIFT_STATUSES.completed;
}

export const isOpenShiftStatus = isActiveShiftStatus;
export const isClosedShiftStatus = isCompletedShiftStatus;

export function isPunchEventType(value: unknown): value is PunchEventType {
  return typeof value === "string" && EVENT_TYPE_VALUES.has(value);
}

export function isBreakEvent(value: string | null | undefined): boolean {
  return value === PUNCH_EVENT_TYPES.breakStart || value === PUNCH_EVENT_TYPES.breakEnd;
}

export function isLunchEvent(value: string | null | undefined): boolean {
  return value === PUNCH_EVENT_TYPES.lunchStart || value === PUNCH_EVENT_TYPES.lunchEnd;
}

function eventTime(event: ShiftEventLike): string {
  return event.timestamp ?? event.created_at ?? "";
}

export function latestValidPunchEvent(events: readonly ShiftEventLike[] | null | undefined): {
  eventType: PunchEventType | null;
  eventAt: string | null;
} {
  const latest = [...(events ?? [])]
    .filter((event) => isPunchEventType(event.event_type))
    .sort((a, b) => eventTime(a).localeCompare(eventTime(b)))
    .at(-1);

  return {
    eventType: isPunchEventType(latest?.event_type) ? latest.event_type : null,
    eventAt: latest ? eventTime(latest) || null : null,
  };
}

export function deriveCurrentShiftActivity(
  events: readonly ShiftEventLike[] | null | undefined,
  hasActiveShift = true,
): ShiftActivity {
  if (!hasActiveShift) return SHIFT_ACTIVITIES.offShift;

  const { eventType } = latestValidPunchEvent(events);
  switch (eventType) {
    case PUNCH_EVENT_TYPES.breakStart:
      return SHIFT_ACTIVITIES.onBreak;
    case PUNCH_EVENT_TYPES.lunchStart:
      return SHIFT_ACTIVITIES.onLunch;
    case PUNCH_EVENT_TYPES.endShift:
      return SHIFT_ACTIVITIES.offShift;
    case PUNCH_EVENT_TYPES.startShift:
    case PUNCH_EVENT_TYPES.breakEnd:
    case PUNCH_EVENT_TYPES.lunchEnd:
    case null:
      return SHIFT_ACTIVITIES.working;
  }
}
