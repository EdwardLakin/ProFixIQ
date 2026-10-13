import {
  convertDistance,
  normalizeDistanceUnit,
  todayIso,
  type PmCompletion,
  type PmDimension,
  type PmDistanceUnit,
  type PmMeters,
  type PmPlanStatus,
} from "@/features/equipment/lib/pm";

/**
 * Equipment meter history.
 *
 * Merges dated meter values the shop already records (manual readings, PM
 * completions, work-order odometers) into one timeline, flags a value that is
 * lower than the one before it (a fact; nothing is dropped), and does plain
 * arithmetic on it: usage per day over a window, and when a PM plan's
 * remaining interval would run out at that rate. Nothing here predicts
 * failure or decides what work to do.
 */

export const METER_KINDS = ["hours", "distance", "cycles"] as const;
export type MeterKind = (typeof METER_KINDS)[number];

export const METER_KIND_LABELS: Record<MeterKind, string> = {
  hours: "Engine hours",
  distance: "Odometer",
  cycles: "Cycles",
};

export const METER_READING_SOURCES = ["manual", "inspection", "service", "telematics"] as const;
export type MeterReadingSource = (typeof METER_READING_SOURCES)[number];

export const METER_READING_SOURCE_LABELS: Record<MeterReadingSource, string> = {
  manual: "Read on site",
  inspection: "During inspection",
  service: "During service",
  telematics: "Telematics / ECM",
};

/** Usage rate window (days back from today). */
export const METER_RATE_WINDOW_DAYS = 90;

const DAY_MS = 86_400_000;

export type MeterDistance = { value: number; unit: PmDistanceUnit };

export type MeterReading = {
  id: string;
  readAt: string;
  engineHours: number | null;
  odometer: MeterDistance | null;
  cycles: number | null;
  source: MeterReadingSource;
  notes: string | null;
  recordedBy: string | null;
  createdAt: string;
  voided: { at: string; reason: string } | null;
};

export type MeterTimelineOrigin = "reading" | "pm_completion" | "work_order";

export type MeterTimelineEntry = {
  key: string;
  origin: MeterTimelineOrigin;
  /** "Read on site", "PM: 250-hour service", "WO-1042" */
  label: string;
  /** Manual reading id (for voiding); null for other origins. */
  readingId: string | null;
  href: string | null;
  at: string;
  hours: number | null;
  distance: MeterDistance | null;
  cycles: number | null;
  notes: string | null;
  voided: { at: string; reason: string } | null;
  /** Meters lower than the previous (non-voided) value of the same meter. */
  backwards: MeterKind[];
};

export type MeterWorkOrderOdometer = {
  id: string;
  label: string;
  href: string | null;
  createdAt: string | null;
  odometerKm: number | null;
};

function round1(value: number): number {
  return Math.round(value * 10) / 10 + 0;
}

function timeOf(iso: string): number {
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

/** A PM completion is dated by day; it is placed at midday UTC. */
function dayToIso(day: string): string {
  return `${day.slice(0, 10)}T12:00:00.000Z`;
}

function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function meterValue(entry: MeterTimelineEntry, kind: MeterKind, unit: PmDistanceUnit): number | null {
  if (kind === "hours") return entry.hours;
  if (kind === "cycles") return entry.cycles;
  return entry.distance ? convertDistance(entry.distance.value, entry.distance.unit, unit) : null;
}

/**
 * One timeline, newest first, from manual readings, PM completions (their
 * recorded meters) and dated work-order odometers (km). Voided readings and
 * completions are kept (marked) but never count as a value. Each value lower
 * than the previous value of the same meter is flagged.
 */
export function buildMeterTimeline(input: {
  readings: MeterReading[];
  completions: Array<{ completion: PmCompletion; planName: string }>;
  workOrders: MeterWorkOrderOdometer[];
}): MeterTimelineEntry[] {
  const entries: MeterTimelineEntry[] = [];
  for (const reading of input.readings) {
    entries.push({
      key: `reading:${reading.id}`,
      origin: "reading",
      label: METER_READING_SOURCE_LABELS[reading.source] ?? "Reading",
      readingId: reading.id,
      href: null,
      at: reading.readAt,
      hours: reading.engineHours,
      distance: reading.odometer,
      cycles: reading.cycles,
      notes: reading.notes,
      voided: reading.voided,
      backwards: [],
    });
  }
  for (const { completion, planName } of input.completions) {
    const distance =
      completion.distance !== null && completion.distanceUnit
        ? { value: completion.distance, unit: completion.distanceUnit }
        : null;
    if (completion.assetHours === null && distance === null && completion.cycles === null) continue;
    entries.push({
      key: `pm:${completion.id}`,
      origin: "pm_completion",
      label: `PM: ${planName}`,
      readingId: null,
      href: completion.workOrder?.href ?? null,
      at: dayToIso(completion.completedOn),
      hours: completion.assetHours,
      distance,
      cycles: completion.cycles,
      notes: completion.notes,
      voided: completion.voided,
      backwards: [],
    });
  }
  for (const workOrder of input.workOrders) {
    const km = workOrder.odometerKm === null ? null : Number(workOrder.odometerKm);
    if (km === null || !Number.isFinite(km) || km < 0 || !workOrder.createdAt) continue;
    if (!Number.isFinite(Date.parse(workOrder.createdAt))) continue;
    entries.push({
      key: `wo:${workOrder.id}`,
      origin: "work_order",
      label: workOrder.label,
      readingId: null,
      href: workOrder.href,
      at: workOrder.createdAt,
      hours: null,
      distance: { value: km, unit: "km" },
      cycles: null,
      notes: null,
      voided: null,
      backwards: [],
    });
  }

  // Oldest first (key breaks ties) to compare each value with the one before it.
  entries.sort((a, b) => timeOf(a.at) - timeOf(b.at) || a.key.localeCompare(b.key));
  const previous: Record<MeterKind, number | null> = { hours: null, distance: null, cycles: null };
  for (const entry of entries) {
    if (entry.voided) continue;
    for (const kind of METER_KINDS) {
      const value = meterValue(entry, kind, "km");
      if (value === null) continue;
      // Distance is compared in km with a little slack for unit rounding.
      const slack = kind === "distance" ? 0.2 : 0;
      if (previous[kind] !== null && value < (previous[kind] as number) - slack) entry.backwards.push(kind);
      previous[kind] = value;
    }
  }
  return entries.reverse();
}

export type MeterUsageRate =
  | {
      meter: MeterKind;
      status: "ok";
      /** Change per day (h, km/mi or cycles). */
      perDay: number;
      unit: string;
      from: { at: string; value: number };
      to: { at: string; value: number };
      days: number;
      readings: number;
    }
  | {
      meter: MeterKind;
      status: "insufficient";
      unit: string;
      readings: number;
    }
  | {
      /** The latest value in the window is lower than the earliest. */
      meter: MeterKind;
      status: "decreasing";
      unit: string;
      from: { at: string; value: number };
      to: { at: string; value: number };
      days: number;
      readings: number;
    };

/**
 * Usage per day for one meter: (latest − earliest) / days between them, over
 * non-voided values in the last `windowDays` days. Needs at least two values
 * at least one day apart; a decrease is reported as such, never as a rate.
 * Distance is in `distanceUnit`.
 */
export function meterUsageRate(
  timeline: MeterTimelineEntry[],
  meter: MeterKind,
  options: { now?: number; windowDays?: number; distanceUnit?: PmDistanceUnit } = {},
): MeterUsageRate {
  const now = options.now ?? Date.now();
  const windowDays = options.windowDays ?? METER_RATE_WINDOW_DAYS;
  const distanceUnit = options.distanceUnit ?? "km";
  const unit = meter === "hours" ? "h" : meter === "cycles" ? "cycles" : distanceUnit;
  const since = now - windowDays * DAY_MS;
  // One day of grace for readings dated slightly ahead (time zones).
  const until = now + DAY_MS;

  const points = timeline
    .filter((entry) => !entry.voided)
    .map((entry) => ({ at: entry.at, time: timeOf(entry.at), value: meterValue(entry, meter, distanceUnit) }))
    .filter(
      (point): point is { at: string; time: number; value: number } =>
        point.value !== null && point.time >= since && point.time <= until,
    )
    .sort((a, b) => a.time - b.time);

  if (points.length < 2) return { meter, status: "insufficient", unit, readings: points.length };
  const first = points[0];
  const last = points[points.length - 1];
  const days = (last.time - first.time) / DAY_MS;
  if (days < 1) return { meter, status: "insufficient", unit, readings: points.length };

  const from = { at: first.at, value: round1(first.value) };
  const to = { at: last.at, value: round1(last.value) };
  const roundedDays = round1(days);
  if (last.value < first.value) {
    return { meter, status: "decreasing", unit, from, to, days: roundedDays, readings: points.length };
  }
  return {
    meter,
    status: "ok",
    perDay: Math.round(((last.value - first.value) / days) * 100) / 100,
    unit,
    from,
    to,
    days: roundedDays,
    readings: points.length,
  };
}

/** The distance unit to show: the newest non-voided odometer value's unit (km when none). */
export function preferredDistanceUnit(timeline: MeterTimelineEntry[]): PmDistanceUnit {
  return timeline.find((entry) => !entry.voided && entry.distance)?.distance?.unit ?? "km";
}

export type MeterUsageRates = Record<MeterKind, MeterUsageRate>;

export function meterUsageRates(
  timeline: MeterTimelineEntry[],
  options: { now?: number; windowDays?: number; distanceUnit?: PmDistanceUnit } = {},
): MeterUsageRates {
  const distanceUnit = options.distanceUnit ?? preferredDistanceUnit(timeline);
  return {
    hours: meterUsageRate(timeline, "hours", { ...options, distanceUnit }),
    distance: meterUsageRate(timeline, "distance", { ...options, distanceUnit }),
    cycles: meterUsageRate(timeline, "cycles", { ...options, distanceUnit }),
  };
}

export type PmProjectionDimension = {
  dimension: PmDimension;
  /** projected: date from the rate; calendar: the plan's date; reached: already at/past the due point. */
  status: "projected" | "calendar" | "reached" | "no_rate" | "no_usage" | "unknown";
  /** Interval units left from the PM status (plan unit). */
  remaining: number | null;
  unit: string;
  /** Usage per day in the plan's unit. */
  perDay: number | null;
  days: number | null;
  date: string | null;
};

export type PmProjection = {
  planId: string;
  planName: string;
  dimensions: PmProjectionDimension[];
  /** Earliest dated dimension (whichever comes first); null when none is dated. */
  date: string | null;
};

/**
 * For each active PM plan, when each interval would be reached at the
 * current usage rate: remaining (from the PM status) / usage per day, counted
 * from today. Calendar intervals keep the plan's own date. Arithmetic only.
 */
export function projectPmDue(
  plans: PmPlanStatus[],
  rates: MeterUsageRates,
  today: string = todayIso(),
): PmProjection[] {
  return plans
    .filter((status) => status.plan.active)
    .map((status) => {
      const dimensions = status.dimensions.map((entry): PmProjectionDimension => {
        const base = { dimension: entry.dimension, remaining: entry.remaining, unit: entry.unit };
        if (entry.dimension === "days") {
          return { ...base, status: "calendar", perDay: null, days: entry.remaining, date: entry.dueAt as string | null };
        }
        if (entry.remaining === null) return { ...base, status: "unknown", perDay: null, days: null, date: null };
        if (entry.remaining <= 0) return { ...base, status: "reached", perDay: null, days: 0, date: today };
        const rate = rates[entry.dimension as MeterKind];
        if (!rate || rate.status !== "ok") return { ...base, status: "no_rate", perDay: null, days: null, date: null };
        let perDay = rate.perDay;
        if (entry.dimension === "distance") {
          const from = normalizeDistanceUnit(rate.unit);
          const to = normalizeDistanceUnit(entry.unit);
          if (!from || !to) return { ...base, status: "no_rate", perDay: null, days: null, date: null };
          perDay = convertDistance(rate.perDay, from, to);
        }
        if (perDay <= 0) return { ...base, status: "no_usage", perDay: 0, days: null, date: null };
        const days = Math.ceil(entry.remaining / perDay);
        return {
          ...base,
          status: "projected",
          perDay: Math.round(perDay * 100) / 100,
          days,
          date: addDays(today, days),
        };
      });
      const dates = dimensions.map((entry) => entry.date).filter((date): date is string => Boolean(date));
      return {
        planId: status.plan.id,
        planName: status.plan.name,
        dimensions,
        date: dates.length ? dates.sort()[0] : null,
      };
    });
}

export type AssetMeters = {
  /** Current meters as the PM status evaluates them (asset values). */
  current: PmMeters;
  timeline: MeterTimelineEntry[];
  distanceUnit: PmDistanceUnit;
  windowDays: number;
  rates: MeterUsageRates;
  projections: PmProjection[];
};

/** Meters with at least one value in the timeline (voided included). */
export function metersInTimeline(timeline: MeterTimelineEntry[]): MeterKind[] {
  return METER_KINDS.filter((kind) =>
    timeline.some((entry) =>
      kind === "hours" ? entry.hours !== null : kind === "cycles" ? entry.cycles !== null : entry.distance !== null,
    ),
  );
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

export type MeterReadingInput = {
  readAt: string;
  engineHours: number | null;
  odometer: number | null;
  odometerUnit: PmDistanceUnit | null;
  cycles: number | null;
  source: MeterReadingSource;
  notes: string | null;
};

function parseNumber(value: unknown): number | null | "invalid" {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : "invalid";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : "invalid";
  }
  return "invalid";
}

function meterNumber(
  value: unknown,
  label: string,
  max: number,
  whole: boolean,
): Validation<number | null> {
  const parsed = parseNumber(value);
  if (parsed === null) return { ok: true, value: null };
  if (parsed === "invalid" || parsed < 0 || parsed > max || (whole && !Number.isInteger(parsed))) {
    return {
      ok: false,
      error: `${label} must be ${whole ? "a whole number" : "a number"} from 0 to ${max.toLocaleString()}.`,
    };
  }
  return { ok: true, value: whole ? parsed : round1(parsed) };
}

/** Accepts YYYY-MM-DD (midday UTC) or an ISO date-time; not more than a day ahead. */
function parseReadAt(value: unknown, now: number): Validation<string> {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: new Date(now).toISOString() };
  }
  if (typeof value !== "string") return { ok: false, error: "Reading date is invalid." };
  const trimmed = value.trim();
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? dayToIso(trimmed) : trimmed;
  if (!/^\d{4}-\d{2}-\d{2}T/.test(iso)) return { ok: false, error: "Reading date is invalid." };
  const time = Date.parse(iso);
  if (!Number.isFinite(time) || time < Date.parse("1950-01-01T00:00:00Z")) {
    return { ok: false, error: "Reading date is invalid." };
  }
  if (time > now + DAY_MS) return { ok: false, error: "Reading date cannot be in the future." };
  return { ok: true, value: new Date(time).toISOString() };
}

/** Validates a new meter reading: at least one meter, non-negative, odometer with km/mi. */
export function validateMeterReading(body: unknown, now = Date.now()): Validation<MeterReadingInput> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "A meter reading is required." };
  }
  const input = body as Record<string, unknown>;
  const readAt = parseReadAt(input.readAt, now);
  if (!readAt.ok) return readAt;
  const engineHours = meterNumber(input.engineHours, "Engine hours", 10_000_000, false);
  if (!engineHours.ok) return engineHours;
  const odometer = meterNumber(input.odometer, "Odometer", 100_000_000, false);
  if (!odometer.ok) return odometer;
  const cycles = meterNumber(input.cycles, "Cycles", 10_000_000_000, true);
  if (!cycles.ok) return cycles;
  if (engineHours.value === null && odometer.value === null && cycles.value === null) {
    return { ok: false, error: "Enter at least one meter (engine hours, odometer or cycles)." };
  }
  let odometerUnit: PmDistanceUnit | null = null;
  if (odometer.value !== null) {
    odometerUnit = normalizeDistanceUnit(typeof input.odometerUnit === "string" ? input.odometerUnit : null);
    if (!odometerUnit) return { ok: false, error: "Select km or mi for the odometer." };
  }
  let source: MeterReadingSource = "manual";
  if (input.source !== undefined && input.source !== null && input.source !== "") {
    if (!(METER_READING_SOURCES as readonly unknown[]).includes(input.source)) {
      return { ok: false, error: "Select where the reading came from." };
    }
    source = input.source as MeterReadingSource;
  }
  let notes: string | null = null;
  if (input.notes !== undefined && input.notes !== null) {
    if (typeof input.notes !== "string") return { ok: false, error: "Notes must be text." };
    const trimmed = input.notes.trim();
    if (trimmed.length > 1000) return { ok: false, error: "Notes must be 1000 characters or fewer." };
    notes = trimmed || null;
  }
  return {
    ok: true,
    value: {
      readAt: readAt.value,
      engineHours: engineHours.value,
      odometer: odometer.value,
      odometerUnit,
      cycles: cycles.value,
      source,
      notes,
    },
  };
}
