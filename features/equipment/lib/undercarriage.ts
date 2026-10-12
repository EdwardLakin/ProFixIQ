import { componentLabel } from "@/features/equipment/lib/components";
import {
  isMeasurementType,
  MEASUREMENT_TYPES,
  toCanonical,
  type MeasurementSeries,
  type MeasurementType,
} from "@/features/equipment/lib/measurements";

/**
 * Undercarriage module.
 *
 * Wear is a calculation from the technician's recorded measurements against
 * the shop's wear limits (dimension when new and at 100 % worn). Nothing here
 * predicts failure or recommends work; hours-to-limit is the arithmetic
 * continuation of the measured rate and is labelled as such.
 */

/** Undercarriage component types and the measurements that track their wear (primary first). */
export const UNDERCARRIAGE_PART_MEASUREMENTS: Record<string, MeasurementType[]> = {
  track_chain: ["track_link_height", "track_pitch"],
  track_shoes: ["track_shoe_height"],
  track_rollers: ["roller_diameter"],
  carrier_rollers: ["roller_diameter"],
  idler: ["idler_tread_depth"],
  sprocket: ["sprocket_wear"],
  undercarriage: ["undercarriage_wear"],
};

export const UNDERCARRIAGE_PART_ORDER = [
  "track_chain",
  "track_shoes",
  "track_rollers",
  "carrier_rollers",
  "idler",
  "sprocket",
] as const;

export function isUndercarriagePart(componentType: string): boolean {
  return Object.prototype.hasOwnProperty.call(UNDERCARRIAGE_PART_MEASUREMENTS, componentType);
}

export function measurementsForPart(componentType: string): MeasurementType[] {
  return UNDERCARRIAGE_PART_MEASUREMENTS[componentType] ?? [];
}

// ---------------------------------------------------------------------------
// Wear arithmetic
// ---------------------------------------------------------------------------

export type WearLimit = {
  id: string;
  componentId: string;
  measurementType: string;
  unit: string;
  newValue: number;
  limitValue: number;
  reference: string | null;
  setAt: string;
};

function round1(value: number): number {
  // "+ 0" normalizes -0 so an unworn part reads 0 %, not -0 %.
  return Math.round(value * 10) / 10 + 0;
}

/**
 * Percent of the allowed wear used: 0 % at the new dimension, 100 % at the
 * limit. Works whether wear shrinks the dimension (shoe height) or grows it
 * (pitch elongation). Not clamped: past-limit readings report above 100 %.
 */
export function percentWorn(measured: number, limit: Pick<WearLimit, "newValue" | "limitValue">): number | null {
  const span = limit.limitValue - limit.newValue;
  if (!Number.isFinite(measured) || span === 0) return null;
  return round1(((measured - limit.newValue) / span) * 100);
}

export type WearReading = {
  measurementType: string;
  /** Latest reading, canonical unit. */
  latestValue: number;
  unit: string;
  measuredAt: string;
  assetHours: number | null;
  limit: WearLimit | null;
  wornPercent: number | null;
  /** Change in percent worn per 100 asset hours between the last two readings. */
  wornPer100Hours: number | null;
  /**
   * Asset hours until 100 % at the measured rate (arithmetic only). Null when
   * there is no limit, no rate, the rate is not wearing, or it is already past.
   */
  hoursToLimitAtRate: number | null;
};

export function wearReading(series: MeasurementSeries, limit: WearLimit | null): WearReading {
  const latest = series.latest;
  const previous = series.previous;
  const wornPercent = limit ? percentWorn(latest.value, limit) : null;
  let wornPer100Hours: number | null = null;
  if (limit && previous && latest.assetHours !== null && previous.assetHours !== null) {
    const hours = latest.assetHours - previous.assetHours;
    const before = percentWorn(previous.value, limit);
    if (hours > 0 && before !== null && wornPercent !== null) {
      wornPer100Hours = round1(((wornPercent - before) / hours) * 100);
    }
  }
  const hoursToLimitAtRate =
    wornPercent !== null && wornPer100Hours !== null && wornPer100Hours > 0 && wornPercent < 100
      ? Math.round(((100 - wornPercent) / wornPer100Hours) * 100)
      : null;
  return {
    measurementType: series.measurementType,
    latestValue: latest.value,
    unit: latest.unit,
    measuredAt: latest.measuredAt,
    assetHours: latest.assetHours,
    limit,
    wornPercent,
    wornPer100Hours,
    hoursToLimitAtRate,
  };
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export type UndercarriagePart = {
  componentId: string;
  componentType: string;
  label: string;
  serialNumber: string | null;
  /** One entry per tracked measurement type for this part. */
  readings: Array<{
    measurementType: string;
    reading: WearReading | null;
    limit: WearLimit | null;
  }>;
};

export type UndercarriageSide = {
  position: string | null;
  /** The side's undercarriage component, when one exists. */
  sideComponentId: string | null;
  label: string;
  parts: UndercarriagePart[];
};

export type Undercarriage = {
  assetHours: number | null;
  sides: UndercarriageSide[];
};

export function sideLabel(position: string | null): string {
  return componentLabel("undercarriage", position);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

export type WearLimitInput = {
  measurementType: MeasurementType;
  newValue: number;
  limitValue: number;
  unit: string;
  enteredUnit: string;
  reference: string | null;
};

function parseNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Validates a wear limit for a part; values are converted to the canonical unit. */
export function validateWearLimit(body: unknown, componentType: string): Validation<WearLimitInput> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "A wear limit body is required." };
  }
  const input = body as Record<string, unknown>;
  if (!isMeasurementType(input.measurementType)) {
    return { ok: false, error: "Select a recognized measurement." };
  }
  const measurementType = input.measurementType;
  if (!measurementsForPart(componentType).includes(measurementType)) {
    return { ok: false, error: "That measurement does not apply to this component." };
  }
  if (typeof input.unit !== "string") return { ok: false, error: "Select a unit." };
  const newEntered = parseNumber(input.newValue);
  const limitEntered = parseNumber(input.limitValue);
  if (newEntered === null || limitEntered === null) {
    return { ok: false, error: "Enter the new and the 100 % worn dimension." };
  }
  const newValue = toCanonical(measurementType, newEntered, input.unit);
  const limitValue = toCanonical(measurementType, limitEntered, input.unit);
  if (!newValue || !limitValue) return { ok: false, error: "Select a unit for this measurement." };
  const { min, max } = MEASUREMENT_TYPES[measurementType];
  for (const value of [newValue.value, limitValue.value]) {
    if (value < min || value > max) {
      return { ok: false, error: "A value is outside the plausible range." };
    }
  }
  if (newValue.value === limitValue.value) {
    return { ok: false, error: "The new and worn dimensions must differ." };
  }
  let reference: string | null = null;
  if (input.reference !== undefined && input.reference !== null) {
    if (typeof input.reference !== "string") return { ok: false, error: "Reference must be text." };
    const trimmed = input.reference.trim();
    if (trimmed.length > 500) return { ok: false, error: "Reference must be 500 characters or fewer." };
    reference = trimmed || null;
  }
  return {
    ok: true,
    value: {
      measurementType,
      newValue: newValue.value,
      limitValue: limitValue.value,
      unit: newValue.unit,
      enteredUnit: input.unit,
      reference,
    },
  };
}
