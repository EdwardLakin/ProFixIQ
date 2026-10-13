import { isComponentId } from "@/features/equipment/lib/components";
import type { EquipmentPmState } from "@/features/equipment/lib/equipmentDirectory";

/**
 * Equipment PM engine.
 *
 * A PM plan is an interval per asset: every N engine hours, distance, cycles
 * and/or days, whichever comes first. The next due point is arithmetic from
 * the latest completion (or the plan's starting point) plus the interval, and
 * the state compares it with the asset's current meters and today's date.
 * Nothing here predicts failure or decides what work to do; the technician
 * and the shop do.
 */

export const PM_DISTANCE_UNITS = ["km", "mi"] as const;
export type PmDistanceUnit = (typeof PM_DISTANCE_UNITS)[number];

export const PM_DIMENSIONS = ["hours", "distance", "cycles", "days"] as const;
export type PmDimension = (typeof PM_DIMENSIONS)[number];

export const PM_DIMENSION_LABELS: Record<PmDimension, string> = {
  hours: "Engine hours",
  distance: "Distance",
  cycles: "Cycles",
  days: "Calendar",
};

/** "Due" starts when this share of the interval remains (shown in the UI). */
export const PM_DUE_WINDOW = 0.1;

const KM_PER_MILE = 1.609344;

export type PmPlan = {
  id: string;
  assetId: string;
  name: string;
  instructions: string | null;
  intervalHours: number | null;
  intervalDistance: number | null;
  distanceUnit: PmDistanceUnit | null;
  intervalCycles: number | null;
  intervalDays: number | null;
  startDate: string;
  startHours: number | null;
  startDistance: number | null;
  startCycles: number | null;
  active: boolean;
  version: number;
  updatedAt: string;
};

export type PmCompletion = {
  id: string;
  planId: string;
  completedOn: string;
  assetHours: number | null;
  distance: number | null;
  distanceUnit: PmDistanceUnit | null;
  cycles: number | null;
  workOrder: { id: string; label: string; href: string | null } | null;
  notes: string | null;
  recordedBy: string | null;
  createdAt: string;
  voided: { at: string; reason: string } | null;
};

export type PmMeters = {
  hours: number | null;
  /** Current odometer, when it parses with a known km/mi unit. */
  distance: { value: number; unit: PmDistanceUnit } | null;
  cycles: number | null;
  /** When the meters were last updated on the asset profile (if known). */
  updatedAt: string | null;
  /** Today's date (YYYY-MM-DD) the calendar interval is measured against. */
  today: string;
};

export type PmDimensionStatus = {
  dimension: PmDimension;
  interval: number;
  /** hours / km / mi / cycles / days */
  unit: string;
  /** Meter (or date) at the last completion or starting point. */
  from: number | string | null;
  /** Meter (or date) at which this interval is reached. */
  dueAt: number | string | null;
  /** Current meter (or today). */
  current: number | string | null;
  /** Interval units left (negative = past due). Null when not evaluable. */
  remaining: number | null;
  state: EquipmentPmState;
};

export type PmPlanStatus = {
  plan: PmPlan;
  /** Latest completion that is not voided (the interval counts from it). */
  lastCompletion: PmCompletion | null;
  /** Recent completions, newest first, including voided ones. */
  history: PmCompletion[];
  dimensions: PmDimensionStatus[];
  state: EquipmentPmState;
};

export type AssetPm = {
  meters: PmMeters;
  plans: PmPlanStatus[];
  state: EquipmentPmState;
  /** The asset's work orders the caller can see, for linking a completion. */
  workOrders: Array<{ id: string; label: string; status: string; createdAt: string }>;
};

// ---------------------------------------------------------------------------
// Meters
// ---------------------------------------------------------------------------

function round1(value: number): number {
  return Math.round(value * 10) / 10 + 0;
}

export function normalizeDistanceUnit(unit: string | null | undefined): PmDistanceUnit | null {
  const value = String(unit ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (["km", "kms", "kilometer", "kilometers", "kilometre", "kilometres"].includes(value)) return "km";
  if (["mi", "mile", "miles"].includes(value)) return "mi";
  return null;
}

/**
 * The asset's odometer in a known unit. vehicles.mileage is text such as
 * "42,000" or "42,000 km"; a unit written in the text must agree with
 * odometer_unit when both are present. Null when the value or the unit is
 * unknown or ambiguous, so distance is not evaluated rather than guessed.
 */
export function parseOdometer(
  value: string | number | null | undefined,
  unit: string | null | undefined,
): { value: number; unit: PmDistanceUnit } | null {
  if (value === null || value === undefined) return null;
  const columnUnit = normalizeDistanceUnit(unit);
  if (typeof value === "number") {
    return columnUnit && Number.isFinite(value) && value >= 0 ? { value, unit: columnUnit } : null;
  }
  const match = /^([\d][\d,\s]*(?:\.\d+)?)\s*([a-z.]*)$/i.exec(value.trim());
  if (!match) return null;
  const numeric = Number(match[1].replace(/[,\s]/g, ""));
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  let known = columnUnit;
  if (match[2]) {
    const textUnit = normalizeDistanceUnit(match[2]);
    if (!textUnit || (columnUnit && columnUnit !== textUnit)) return null;
    known = textUnit;
  }
  return known ? { value: numeric, unit: known } : null;
}

export function convertDistance(value: number, from: PmDistanceUnit, to: PmDistanceUnit): number {
  if (from === to) return value;
  return from === "mi" ? value * KM_PER_MILE : value / KM_PER_MILE;
}

// ---------------------------------------------------------------------------
// Due arithmetic
// ---------------------------------------------------------------------------

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function stateFor(remaining: number, interval: number): EquipmentPmState {
  if (remaining < 0) return "overdue";
  return remaining <= interval * PM_DUE_WINDOW ? "due" : "ok";
}

// An interval that cannot be evaluated may already be due, so it ranks above
// "ok": a plan is only up to date when every interval is known to be.
const STATE_RANK: Record<EquipmentPmState, number> = {
  overdue: 4,
  due: 3,
  not_evaluated: 2,
  ok: 1,
};

/** The most urgent state: overdue > due > not evaluated > ok (not evaluated when empty). */
export function worstPmState(states: EquipmentPmState[]): EquipmentPmState {
  if (!states.length) return "not_evaluated";
  return states.reduce((worst, state) => (STATE_RANK[state] > STATE_RANK[worst] ? state : worst));
}

/**
 * One PM state for an asset from its two sources: the Equipment PM plans
 * (null when the asset has no active plan) and the Shop maintenance-suggestion
 * evaluation. A suggestion that was never evaluated is an absence of evidence,
 * not uncertainty, so it is left out; otherwise the most urgent state wins, so
 * neither source can hide the other's alert. Without active plans the result
 * is exactly the suggestion state.
 */
export function combinePmStates(
  planState: EquipmentPmState | null,
  suggestionState: EquipmentPmState,
): EquipmentPmState {
  if (planState === null) return suggestionState;
  return worstPmState(suggestionState === "not_evaluated" ? [planState] : [planState, suggestionState]);
}

/** Latest completion that is not voided; input may be in any order. */
export function lastCompletion(completions: PmCompletion[]): PmCompletion | null {
  return (
    completions
      .filter((completion) => !completion.voided)
      .sort(
        (a, b) =>
          b.completedOn.localeCompare(a.completedOn) || b.createdAt.localeCompare(a.createdAt),
      )[0] ?? null
  );
}

function meterDimension(
  dimension: Exclude<PmDimension, "days" | "distance">,
  interval: number,
  from: number | null,
  current: number | null,
  unit: string,
): PmDimensionStatus {
  if (from === null) {
    return { dimension, interval, unit, from, dueAt: null, current, remaining: null, state: "not_evaluated" };
  }
  const dueAt = from + interval;
  if (current === null) {
    return { dimension, interval, unit, from, dueAt, current, remaining: null, state: "not_evaluated" };
  }
  const remaining = dueAt - current;
  return { dimension, interval, unit, from, dueAt, current, remaining, state: stateFor(remaining, interval) };
}

/**
 * Status of one plan against the asset's meters. Each interval counts from the
 * latest non-voided completion, or from the plan's starting point before the
 * first completion (or when that completion has no reading for an interval
 * added to the plan later). Each interval is evaluated on its own; the plan is as
 * urgent as its most urgent interval (whichever comes first).
 */
export function evaluatePmPlan(
  plan: PmPlan,
  completions: PmCompletion[],
  meters: PmMeters,
): PmPlanStatus {
  const last = lastCompletion(completions);
  const dimensions: PmDimensionStatus[] = [];

  if (plan.intervalHours !== null) {
    const from = last?.assetHours ?? plan.startHours;
    dimensions.push(meterDimension("hours", plan.intervalHours, from, meters.hours, "h"));
  }

  if (plan.intervalDistance !== null && plan.distanceUnit) {
    const unit = plan.distanceUnit;
    const from =
      last && last.distance !== null && last.distanceUnit
        ? convertDistance(last.distance, last.distanceUnit, unit)
        : plan.startDistance;
    const current = meters.distance ? convertDistance(meters.distance.value, meters.distance.unit, unit) : null;
    const interval = plan.intervalDistance;
    if (from === null || current === null) {
      dimensions.push({
        dimension: "distance",
        interval,
        unit,
        from: from === null ? null : round1(from),
        dueAt: from === null ? null : round1(from + interval),
        current: current === null ? null : round1(current),
        remaining: null,
        state: "not_evaluated",
      });
    } else {
      const remaining = round1(from + interval - current);
      dimensions.push({
        dimension: "distance",
        interval,
        unit,
        from: round1(from),
        dueAt: round1(from + interval),
        current: round1(current),
        remaining,
        state: stateFor(remaining, interval),
      });
    }
  }

  if (plan.intervalCycles !== null) {
    const from = last?.cycles ?? plan.startCycles;
    dimensions.push(meterDimension("cycles", plan.intervalCycles, from, meters.cycles, "cycles"));
  }

  if (plan.intervalDays !== null) {
    const from = last ? last.completedOn : plan.startDate;
    const dueAt = addDays(from, plan.intervalDays);
    const remaining = daysBetween(meters.today, dueAt);
    dimensions.push({
      dimension: "days",
      interval: plan.intervalDays,
      unit: "days",
      from,
      dueAt,
      current: meters.today,
      remaining,
      state: stateFor(remaining, plan.intervalDays),
    });
  }

  const history = [...completions].sort(
    (a, b) => b.completedOn.localeCompare(a.completedOn) || b.createdAt.localeCompare(a.createdAt),
  );
  return {
    plan,
    lastCompletion: last,
    history,
    dimensions,
    state: plan.active ? worstPmState(dimensions.map((entry) => entry.state)) : "not_evaluated",
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

export type PmPlanInput = {
  name: string;
  instructions: string | null;
  intervalHours: number | null;
  intervalDistance: number | null;
  distanceUnit: PmDistanceUnit | null;
  intervalCycles: number | null;
  intervalDays: number | null;
  startDate: string;
  startHours: number | null;
  startDistance: number | null;
  startCycles: number | null;
  active: boolean;
};

export type PmCompletionInput = {
  completedOn: string;
  assetHours: number | null;
  distance: number | null;
  distanceUnit: PmDistanceUnit | null;
  cycles: number | null;
  workOrderId: string | null;
  notes: string | null;
};

function parseNumber(value: unknown): number | null | "invalid" {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : "invalid";
  if (typeof value === "string") {
    const parsed = Number(value.trim().replace(/,/g, ""));
    return value.trim() !== "" && Number.isFinite(parsed) ? parsed : "invalid";
  }
  return "invalid";
}

function wholeNumber(
  value: unknown,
  label: string,
  min: number,
  max: number,
): Validation<number | null> {
  const parsed = parseNumber(value);
  if (parsed === null) return { ok: true, value: null };
  if (parsed === "invalid" || !Number.isInteger(parsed) || parsed < min || parsed > max) {
    return { ok: false, error: `${label} must be a whole number from ${min.toLocaleString()} to ${max.toLocaleString()}.` };
  }
  return { ok: true, value: parsed };
}

function distanceNumber(value: unknown, label: string, min: number): Validation<number | null> {
  const parsed = parseNumber(value);
  if (parsed === null) return { ok: true, value: null };
  if (parsed === "invalid" || parsed < min || parsed > 10_000_000) {
    return { ok: false, error: `${label} is out of range.` };
  }
  return { ok: true, value: round1(parsed) };
}

function optionalText(value: unknown, label: string, max: number): Validation<string | null> {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: `${label} must be text.` };
  const trimmed = value.trim();
  if (trimmed.length > max) return { ok: false, error: `${label} must be ${max} characters or fewer.` };
  return { ok: true, value: trimmed || null };
}

/** Today in UTC as YYYY-MM-DD (the server's calendar for PM dates). */
export function todayIso(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

function parseDay(value: unknown, label: string, fallback: string, now: number): Validation<string> {
  if (value === undefined || value === null || value === "") return { ok: true, value: fallback };
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`))) {
    return { ok: false, error: `${label} is invalid.` };
  }
  // One day of grace for time zones ahead of UTC.
  if (value > todayIso(now + 86_400_000)) return { ok: false, error: `${label} cannot be in the future.` };
  return { ok: true, value };
}

/** Validates a full plan (create or update). Starting meters are required for each meter interval. */
export function validatePmPlan(body: unknown, now = Date.now()): Validation<PmPlanInput> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "A PM plan is required." };
  }
  const input = body as Record<string, unknown>;
  if (typeof input.name !== "string" || !input.name.trim()) return { ok: false, error: "Enter a plan name." };
  const name = input.name.trim();
  if (name.length > 120) return { ok: false, error: "Plan name must be 120 characters or fewer." };
  const instructions = optionalText(input.instructions, "Instructions", 2000);
  if (!instructions.ok) return instructions;

  const intervalHours = wholeNumber(input.intervalHours, "Hour interval", 1, 1_000_000);
  if (!intervalHours.ok) return intervalHours;
  const intervalDistance = distanceNumber(input.intervalDistance, "Distance interval", 0.1);
  if (!intervalDistance.ok) return intervalDistance;
  const intervalCycles = wholeNumber(input.intervalCycles, "Cycle interval", 1, 100_000_000);
  if (!intervalCycles.ok) return intervalCycles;
  const intervalDays = wholeNumber(input.intervalDays, "Day interval", 1, 3660);
  if (!intervalDays.ok) return intervalDays;
  if (
    intervalHours.value === null &&
    intervalDistance.value === null &&
    intervalCycles.value === null &&
    intervalDays.value === null
  ) {
    return { ok: false, error: "Set at least one interval (hours, distance, cycles or days)." };
  }

  let distanceUnit: PmDistanceUnit | null = null;
  if (intervalDistance.value !== null) {
    distanceUnit = normalizeDistanceUnit(typeof input.distanceUnit === "string" ? input.distanceUnit : null);
    if (!distanceUnit) return { ok: false, error: "Select km or mi for the distance interval." };
  }

  const startDate = parseDay(input.startDate, "Start date", todayIso(now), now);
  if (!startDate.ok) return startDate;
  const startHours = wholeNumber(input.startHours, "Starting hours", 0, 10_000_000);
  if (!startHours.ok) return startHours;
  const startDistance = distanceNumber(input.startDistance, "Starting distance", 0);
  if (!startDistance.ok) return startDistance;
  const startCycles = wholeNumber(input.startCycles, "Starting cycles", 0, 1_000_000_000);
  if (!startCycles.ok) return startCycles;
  if (intervalHours.value !== null && startHours.value === null) {
    return { ok: false, error: "Enter the engine hours the hour interval counts from." };
  }
  if (intervalDistance.value !== null && startDistance.value === null) {
    return { ok: false, error: "Enter the odometer the distance interval counts from." };
  }
  if (intervalCycles.value !== null && startCycles.value === null) {
    return { ok: false, error: "Enter the cycle count the cycle interval counts from." };
  }

  if (input.active !== undefined && typeof input.active !== "boolean") {
    return { ok: false, error: "Active must be true or false." };
  }

  return {
    ok: true,
    value: {
      name,
      instructions: instructions.value,
      intervalHours: intervalHours.value,
      intervalDistance: intervalDistance.value,
      distanceUnit,
      intervalCycles: intervalCycles.value,
      intervalDays: intervalDays.value,
      startDate: startDate.value,
      // Starting points only apply to intervals the plan uses.
      startHours: intervalHours.value === null ? null : startHours.value,
      startDistance: intervalDistance.value === null ? null : startDistance.value,
      startCycles: intervalCycles.value === null ? null : startCycles.value,
      active: input.active === undefined ? true : input.active,
    },
  };
}

/**
 * Validates a completion for a plan. The meters for each meter interval the
 * plan uses are required (the next interval counts from them); the distance
 * is in the plan's unit.
 */
export function validatePmCompletion(
  body: unknown,
  plan: Pick<PmPlan, "intervalHours" | "intervalDistance" | "distanceUnit" | "intervalCycles">,
  now = Date.now(),
): Validation<PmCompletionInput> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "A completion is required." };
  }
  const input = body as Record<string, unknown>;
  const completedOn = parseDay(input.completedOn, "Completion date", todayIso(now), now);
  if (!completedOn.ok) return completedOn;
  const assetHours = wholeNumber(input.assetHours, "Engine hours", 0, 10_000_000);
  if (!assetHours.ok) return assetHours;
  const distance = distanceNumber(input.distance, "Odometer", 0);
  if (!distance.ok) return distance;
  const cycles = wholeNumber(input.cycles, "Cycles", 0, 1_000_000_000);
  if (!cycles.ok) return cycles;
  if (plan.intervalHours !== null && assetHours.value === null) {
    return { ok: false, error: "Enter the engine hours at completion." };
  }
  if (plan.intervalDistance !== null && distance.value === null) {
    return { ok: false, error: "Enter the odometer at completion." };
  }
  if (plan.intervalCycles !== null && cycles.value === null) {
    return { ok: false, error: "Enter the cycle count at completion." };
  }
  if (distance.value !== null && !plan.distanceUnit) {
    return { ok: false, error: "This plan has no distance interval." };
  }
  let workOrderId: string | null = null;
  if (input.workOrderId !== undefined && input.workOrderId !== null && input.workOrderId !== "") {
    if (!isComponentId(input.workOrderId)) return { ok: false, error: "Select a valid work order." };
    workOrderId = input.workOrderId;
  }
  const notes = optionalText(input.notes, "Notes", 1000);
  if (!notes.ok) return notes;
  return {
    ok: true,
    value: {
      completedOn: completedOn.value,
      assetHours: assetHours.value,
      distance: distance.value,
      distanceUnit: distance.value === null ? null : plan.distanceUnit,
      cycles: cycles.value,
      workOrderId,
      notes: notes.value,
    },
  };
}

export function validateVoidReason(value: unknown): Validation<string> {
  if (typeof value !== "string" || !value.trim()) return { ok: false, error: "Enter a reason for voiding." };
  const reason = value.trim();
  if (reason.length > 500) return { ok: false, error: "Reason must be 500 characters or fewer." };
  return { ok: true, value: reason };
}

/** Plain-language summary of a plan's intervals ("every 250 h or 90 days"). */
export function pmIntervalSummary(
  plan: Pick<PmPlan, "intervalHours" | "intervalDistance" | "distanceUnit" | "intervalCycles" | "intervalDays">,
): string {
  const parts: string[] = [];
  if (plan.intervalHours !== null) parts.push(`${plan.intervalHours.toLocaleString()} h`);
  if (plan.intervalDistance !== null && plan.distanceUnit) {
    parts.push(`${plan.intervalDistance.toLocaleString()} ${plan.distanceUnit}`);
  }
  if (plan.intervalCycles !== null) parts.push(`${plan.intervalCycles.toLocaleString()} cycles`);
  if (plan.intervalDays !== null) parts.push(`${plan.intervalDays.toLocaleString()} days`);
  return parts.length ? `Every ${parts.join(" or ")}, whichever comes first` : "No interval";
}
