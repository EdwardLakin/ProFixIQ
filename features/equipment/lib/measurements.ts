import {
  COMPONENT_POSITION_LABELS,
  isComponentId,
  parseEventDate,
  type ComponentPosition,
} from "@/features/equipment/lib/components";

/**
 * Equipment measurement vocabulary.
 *
 * A measurement is a typed numeric reading on an asset (optionally a
 * component). Values are stored in the type's canonical unit together with
 * exactly what was entered. Facts only: no limits, predictions or verdicts —
 * the technician interprets the readings.
 */

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

type UnitDef = { label: string; toCanonical: (value: number) => number };

export const MEASUREMENT_DIMENSIONS = {
  length: {
    canonical: "mm",
    units: {
      mm: { label: "mm", toCanonical: (v) => v },
      in: { label: "in", toCanonical: (v) => v * 25.4 },
    },
  },
  pressure: {
    canonical: "kPa",
    units: {
      kPa: { label: "kPa", toCanonical: (v) => v },
      psi: { label: "psi", toCanonical: (v) => v * 6.894757 },
      bar: { label: "bar", toCanonical: (v) => v * 100 },
    },
  },
  temperature: {
    canonical: "C",
    units: {
      C: { label: "°C", toCanonical: (v) => v },
      F: { label: "°F", toCanonical: (v) => ((v - 32) * 5) / 9 },
    },
  },
  percent: {
    canonical: "%",
    units: { "%": { label: "%", toCanonical: (v) => v } },
  },
  voltage: {
    canonical: "V",
    units: { V: { label: "V", toCanonical: (v) => v } },
  },
  flow: {
    canonical: "L/min",
    units: {
      "L/min": { label: "L/min", toCanonical: (v) => v },
      cfm: { label: "cfm", toCanonical: (v) => v * 28.316847 },
    },
  },
  speed: {
    canonical: "rpm",
    units: { rpm: { label: "rpm", toCanonical: (v) => v } },
  },
} satisfies Record<string, { canonical: string; units: Record<string, UnitDef> }>;

export type MeasurementDimension = keyof typeof MEASUREMENT_DIMENSIONS;

// ---------------------------------------------------------------------------
// Measurement types
// ---------------------------------------------------------------------------

type MeasurementTypeDef = {
  label: string;
  dimension: MeasurementDimension;
  /** Plausible canonical range; rejects typos, not a wear limit. */
  min: number;
  max: number;
};

export const MEASUREMENT_TYPES = {
  track_shoe_height: { label: "Track shoe grouser height", dimension: "length", min: 0, max: 300 },
  track_link_height: { label: "Track link height", dimension: "length", min: 0, max: 400 },
  track_pitch: { label: "Track pitch (over 4 links)", dimension: "length", min: 0, max: 5000 },
  undercarriage_wear: { label: "Undercarriage wear", dimension: "percent", min: 0, max: 150 },
  sprocket_wear: { label: "Sprocket wear", dimension: "percent", min: 0, max: 150 },
  roller_diameter: { label: "Roller tread diameter", dimension: "length", min: 0, max: 600 },
  idler_tread_depth: { label: "Idler tread depth", dimension: "length", min: 0, max: 200 },
  tire_tread_depth: { label: "Tire tread depth", dimension: "length", min: 0, max: 200 },
  tire_pressure: { label: "Tire pressure", dimension: "pressure", min: 0, max: 2000 },
  brake_lining_thickness: { label: "Brake lining thickness", dimension: "length", min: 0, max: 100 },
  cutting_edge_thickness: { label: "Cutting edge thickness", dimension: "length", min: 0, max: 200 },
  bucket_tooth_length: { label: "Bucket tooth length", dimension: "length", min: 0, max: 1000 },
  engine_oil_pressure: { label: "Engine oil pressure", dimension: "pressure", min: 0, max: 2000 },
  hydraulic_pressure: { label: "Hydraulic pressure", dimension: "pressure", min: 0, max: 100000 },
  pilot_pressure: { label: "Pilot pressure", dimension: "pressure", min: 0, max: 20000 },
  coolant_temperature: { label: "Coolant temperature", dimension: "temperature", min: -60, max: 200 },
  hydraulic_oil_temperature: { label: "Hydraulic oil temperature", dimension: "temperature", min: -60, max: 200 },
  exhaust_temperature: { label: "Exhaust temperature", dimension: "temperature", min: -60, max: 1200 },
  crankcase_blow_by: { label: "Crankcase blow-by", dimension: "flow", min: 0, max: 2000 },
  battery_voltage: { label: "Battery voltage", dimension: "voltage", min: 0, max: 1000 },
  engine_speed: { label: "Engine speed", dimension: "speed", min: 0, max: 10000 },
  cylinder_drift: { label: "Cylinder drift", dimension: "length", min: 0, max: 1000 },
} satisfies Record<string, MeasurementTypeDef>;

export type MeasurementType = keyof typeof MEASUREMENT_TYPES;

export function isMeasurementType(value: unknown): value is MeasurementType {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(MEASUREMENT_TYPES, value);
}

export function measurementLabel(type: string, position: string | null): string {
  const base = isMeasurementType(type) ? MEASUREMENT_TYPES[type].label : type;
  const side = position
    ? COMPONENT_POSITION_LABELS[position as ComponentPosition] ?? position
    : null;
  return side ? `${base} — ${side}` : base;
}

export function unitsForType(type: MeasurementType): Array<{ value: string; label: string }> {
  const dimension = MEASUREMENT_DIMENSIONS[MEASUREMENT_TYPES[type].dimension];
  return Object.entries(dimension.units).map(([value, def]) => ({ value, label: (def as UnitDef).label }));
}

export function canonicalUnit(type: MeasurementType): string {
  return MEASUREMENT_DIMENSIONS[MEASUREMENT_TYPES[type].dimension].canonical;
}

export function unitLabel(unit: string): string {
  for (const dimension of Object.values(MEASUREMENT_DIMENSIONS)) {
    const def = (dimension.units as Record<string, UnitDef>)[unit];
    if (def) return def.label;
  }
  return unit;
}

/** Converts an entered value to the type's canonical unit (4 decimals). */
export function toCanonical(
  type: MeasurementType,
  value: number,
  unit: string,
): { value: number; unit: string } | null {
  const dimension = MEASUREMENT_DIMENSIONS[MEASUREMENT_TYPES[type].dimension];
  const def = (dimension.units as Record<string, UnitDef>)[unit];
  if (!def || !Number.isFinite(value)) return null;
  return { value: Math.round(def.toCanonical(value) * 10_000) / 10_000, unit: dimension.canonical };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

export type MeasurementEntry = {
  measurementType: MeasurementType;
  position: ComponentPosition | null;
  componentId: string | null;
  value: number;
  unit: string;
  enteredValue: number;
  enteredUnit: string;
  notes: string | null;
};

export type MeasurementBatch = {
  entries: MeasurementEntry[];
  measuredAt: string | null;
  workOrderId: string | null;
  inspectionId: string | null;
  operationKey: string;
};

function optionalText(value: unknown, field: string, max: number): Validation<string | null> {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: `${field} must be text.` };
  const trimmed = value.trim();
  if (trimmed.length > max) return { ok: false, error: `${field} must be ${max} characters or fewer.` };
  return { ok: true, value: trimmed || null };
}

function optionalId(value: unknown, field: string): Validation<string | null> {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  return isComponentId(value) ? { ok: true, value } : { ok: false, error: `${field} is invalid.` };
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function validateMeasurementEntry(raw: unknown, index = 0): Validation<MeasurementEntry> {
  const at = `Reading ${index + 1}`;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: `${at} is invalid.` };
  }
  const input = raw as Record<string, unknown>;
  if (!isMeasurementType(input.measurementType)) {
    return { ok: false, error: `${at}: select a recognized measurement.` };
  }
  const measurementType = input.measurementType;

  let position: ComponentPosition | null = null;
  if (input.position !== undefined && input.position !== null && input.position !== "") {
    if (typeof input.position !== "string" || !(input.position in COMPONENT_POSITION_LABELS)) {
      return { ok: false, error: `${at}: select a recognized position.` };
    }
    position = input.position as ComponentPosition;
  }

  const componentId = optionalId(input.componentId, `${at}: component`);
  if (!componentId.ok) return componentId;

  const enteredValue = parseNumber(input.value);
  if (enteredValue === null) return { ok: false, error: `${at}: enter a number.` };
  if (typeof input.unit !== "string") return { ok: false, error: `${at}: select a unit.` };
  const canonical = toCanonical(measurementType, enteredValue, input.unit);
  if (!canonical) return { ok: false, error: `${at}: select a unit for this measurement.` };
  const { min, max } = MEASUREMENT_TYPES[measurementType];
  if (canonical.value < min || canonical.value > max) {
    return { ok: false, error: `${at}: the value is outside the plausible range.` };
  }

  const notes = optionalText(input.notes, `${at}: notes`, 1000);
  if (!notes.ok) return notes;

  return {
    ok: true,
    value: {
      measurementType,
      position,
      componentId: componentId.value,
      value: canonical.value,
      unit: canonical.unit,
      enteredValue,
      enteredUnit: input.unit,
      notes: notes.value,
    },
  };
}

export function validateMeasurementBatch(body: unknown): Validation<MeasurementBatch> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "A measurement body is required." };
  }
  const input = body as Record<string, unknown>;
  if (!Array.isArray(input.readings) || input.readings.length < 1 || input.readings.length > 100) {
    return { ok: false, error: "Enter between 1 and 100 readings." };
  }
  const entries: MeasurementEntry[] = [];
  for (const [index, raw] of input.readings.entries()) {
    const entry = validateMeasurementEntry(raw, index);
    if (!entry.ok) return entry;
    entries.push(entry.value);
  }
  const measuredAt = parseEventDate(input.measuredAt);
  if (!measuredAt.ok) return measuredAt;
  const workOrderId = optionalId(input.workOrderId, "Work order");
  if (!workOrderId.ok) return workOrderId;
  const inspectionId = optionalId(input.inspectionId, "Inspection");
  if (!inspectionId.ok) return inspectionId;
  if (!isComponentId(input.operationKey)) {
    return { ok: false, error: "An operation key is required." };
  }
  return {
    ok: true,
    value: {
      entries,
      measuredAt: measuredAt.value,
      workOrderId: workOrderId.value,
      inspectionId: inspectionId.value,
      operationKey: input.operationKey,
    },
  };
}

export type MeasurementCorrection =
  | { void: true; reason: string; operationKey: string }
  | {
      void: false;
      reason: string;
      operationKey: string;
      enteredValue: number;
      enteredUnit: string;
    };

export function validateMeasurementCorrection(body: unknown): Validation<MeasurementCorrection> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "A correction body is required." };
  }
  const input = body as Record<string, unknown>;
  const reason = optionalText(input.reason, "Reason", 500);
  if (!reason.ok) return reason;
  if (!reason.value) return { ok: false, error: "Give a reason for the correction." };
  if (!isComponentId(input.operationKey)) {
    return { ok: false, error: "An operation key is required." };
  }
  if (input.void === true) {
    return { ok: true, value: { void: true, reason: reason.value, operationKey: input.operationKey } };
  }
  const enteredValue = parseNumber(input.value);
  if (enteredValue === null) return { ok: false, error: "Enter the corrected number." };
  if (typeof input.unit !== "string" || !input.unit) {
    return { ok: false, error: "Select a unit." };
  }
  return {
    ok: true,
    value: {
      void: false,
      reason: reason.value,
      operationKey: input.operationKey,
      enteredValue,
      enteredUnit: input.unit,
    },
  };
}

// ---------------------------------------------------------------------------
// Shared shapes and series
// ---------------------------------------------------------------------------

export type EquipmentMeasurement = {
  id: string;
  sequence: number;
  measurementType: string;
  position: string | null;
  componentId: string | null;
  componentName: string | null;
  value: number;
  unit: string;
  enteredValue: number;
  enteredUnit: string;
  assetHours: number | null;
  measuredAt: string;
  workOrderId: string | null;
  inspectionId: string | null;
  notes: string | null;
  correctsMeasurementId: string | null;
  voided: boolean;
  correctionReason: string | null;
  recordedBy: string | null;
};

export type MeasurementSeriesPoint = {
  /** The current (latest correction of the) reading. */
  id: string;
  /** Original reading id this point belongs to. */
  originalId: string;
  value: number;
  unit: string;
  enteredValue: number;
  enteredUnit: string;
  assetHours: number | null;
  measuredAt: string;
  notes: string | null;
  corrected: boolean;
  correctionReason: string | null;
  recordedBy: string | null;
};

export type MeasurementSeries = {
  key: string;
  measurementType: string;
  position: string | null;
  componentId: string | null;
  componentName: string | null;
  label: string;
  /** Newest first. Voided readings are excluded. */
  points: MeasurementSeriesPoint[];
  latest: MeasurementSeriesPoint;
  previous: MeasurementSeriesPoint | null;
  /** latest − previous, canonical unit. */
  change: number | null;
  hoursBetween: number | null;
  /** Change per 100 asset hours, when both readings have hours. */
  changePer100Hours: number | null;
};

export function seriesKey(
  measurementType: string,
  position: string | null,
  componentId: string | null,
): string {
  return [measurementType, position ?? "", componentId ?? ""].join("|");
}

/**
 * Collapse correction chains to their current reading, drop voided readings,
 * and group into series (type + position + component), newest first.
 */
export function buildMeasurementSeries(rows: EquipmentMeasurement[]): MeasurementSeries[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const correctedBy = new Map<string, EquipmentMeasurement>();
  for (const row of rows) {
    if (row.correctsMeasurementId) correctedBy.set(row.correctsMeasurementId, row);
  }
  const rootOf = (row: EquipmentMeasurement): EquipmentMeasurement => {
    let current = row;
    for (let guard = 0; guard < 100 && current.correctsMeasurementId; guard += 1) {
      const parent = byId.get(current.correctsMeasurementId);
      if (!parent) break;
      current = parent;
    }
    return current;
  };

  const groups = new Map<string, { sample: EquipmentMeasurement; points: MeasurementSeriesPoint[] }>();
  for (const row of rows) {
    if (correctedBy.has(row.id)) continue; // superseded
    if (row.voided) continue;
    const root = rootOf(row);
    const key = seriesKey(row.measurementType, row.position, row.componentId);
    const group = groups.get(key) ?? { sample: row, points: [] };
    group.points.push({
      id: row.id,
      originalId: root.id,
      value: row.value,
      unit: row.unit,
      enteredValue: row.enteredValue,
      enteredUnit: row.enteredUnit,
      assetHours: row.assetHours,
      measuredAt: row.measuredAt,
      notes: row.notes,
      corrected: row.id !== root.id,
      correctionReason: row.correctionReason,
      recordedBy: row.recordedBy,
    });
    groups.set(key, group);
  }

  const series: MeasurementSeries[] = [];
  for (const [key, { sample, points }] of groups) {
    const sequenceOf = (point: MeasurementSeriesPoint) => byId.get(point.originalId)?.sequence ?? 0;
    points.sort(
      (a, b) =>
        Date.parse(b.measuredAt) - Date.parse(a.measuredAt) || sequenceOf(b) - sequenceOf(a),
    );
    const [latest, previous = null] = points;
    const change = previous ? round(latest.value - previous.value) : null;
    const hoursBetween =
      previous && latest.assetHours !== null && previous.assetHours !== null
        ? latest.assetHours - previous.assetHours
        : null;
    series.push({
      key,
      measurementType: sample.measurementType,
      position: sample.position,
      componentId: sample.componentId,
      componentName: sample.componentName,
      label:
        measurementLabel(sample.measurementType, sample.position) +
        (sample.componentName ? ` · ${sample.componentName}` : ""),
      points,
      latest,
      previous,
      change,
      hoursBetween,
      changePer100Hours:
        change !== null && hoursBetween !== null && hoursBetween > 0
          ? round((change / hoursBetween) * 100)
          : null,
    });
  }
  return series.sort((a, b) => a.label.localeCompare(b.label));
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export function formatMeasurement(value: number, unit: string): string {
  const digits = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: digits })} ${unitLabel(unit)}`;
}
