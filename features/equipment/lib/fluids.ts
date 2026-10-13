/**
 * Equipment fluid / oil sample history.
 *
 * Facts and arithmetic only: lab statuses and result flags are shown exactly
 * as the lab reported them, and trends are plain differences between
 * consecutive samples. Nothing here sets a threshold, judges a result or
 * recommends work; the technician makes the diagnosis and repair decision.
 */

export const FLUID_TYPES = {
  engine_oil: "Engine oil",
  hydraulic: "Hydraulic",
  transmission: "Transmission",
  coolant: "Coolant",
  final_drive: "Final drive",
  differential: "Differential",
  fuel: "Fuel",
  other: "Other",
} as const;

export type FluidType = keyof typeof FLUID_TYPES;

/** Lab overall status, as reported by the lab (never computed here). */
export const LAB_STATUSES = {
  normal: "Normal",
  caution: "Caution",
  critical: "Critical",
  unknown: "Not reported",
} as const;

export type LabStatus = keyof typeof LAB_STATUSES;

/** Per-result flag, as reported by the lab (null = no flag given). */
export const LAB_FLAGS = {
  normal: "Normal",
  caution: "Caution",
  critical: "Critical",
} as const;

export type LabFlag = keyof typeof LAB_FLAGS;

/** Common analytes, for labels and the default unit in the record form. */
export const COMMON_ANALYTES: Record<string, { label: string; unit: string }> = {
  iron: { label: "Iron (Fe)", unit: "ppm" },
  copper: { label: "Copper (Cu)", unit: "ppm" },
  lead: { label: "Lead (Pb)", unit: "ppm" },
  aluminum: { label: "Aluminum (Al)", unit: "ppm" },
  chromium: { label: "Chromium (Cr)", unit: "ppm" },
  tin: { label: "Tin (Sn)", unit: "ppm" },
  nickel: { label: "Nickel (Ni)", unit: "ppm" },
  silicon: { label: "Silicon (Si)", unit: "ppm" },
  sodium: { label: "Sodium (Na)", unit: "ppm" },
  potassium: { label: "Potassium (K)", unit: "ppm" },
  water: { label: "Water", unit: "%" },
  fuel_dilution: { label: "Fuel dilution", unit: "%" },
  glycol: { label: "Glycol", unit: "%" },
  soot: { label: "Soot", unit: "%" },
  oxidation: { label: "Oxidation", unit: "Abs/cm" },
  nitration: { label: "Nitration", unit: "Abs/cm" },
  viscosity_40c: { label: "Viscosity @ 40 °C", unit: "cSt" },
  viscosity_100c: { label: "Viscosity @ 100 °C", unit: "cSt" },
  tbn: { label: "TBN", unit: "mg KOH/g" },
  tan: { label: "TAN", unit: "mg KOH/g" },
  pq_index: { label: "PQ index", unit: "" },
  iso_4406: { label: "ISO 4406 (≥4 µm)", unit: "" },
};

const ANALYTE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_FLUID_RESULTS = 100;

export function isFluidType(value: unknown): value is FluidType {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(FLUID_TYPES, value);
}

export function isLabStatus(value: unknown): value is LabStatus {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(LAB_STATUSES, value);
}

export function isLabFlag(value: unknown): value is LabFlag {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(LAB_FLAGS, value);
}

export function fluidTypeLabel(value: string): string {
  return isFluidType(value) ? FLUID_TYPES[value] : value;
}

export function labStatusLabel(value: string): string {
  return isLabStatus(value) ? LAB_STATUSES[value] : value;
}

/** "Viscosity 100c" style key → stored analyte key ("viscosity_100c"), or null. */
export function normalizeAnalyte(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return ANALYTE_PATTERN.test(key) ? key : null;
}

export function analyteLabel(key: string): string {
  const known = COMMON_ANALYTES[key];
  if (known) return known.label;
  const words = key.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

export type FluidSampleResultInput = {
  analyte: string;
  value: number;
  unit: string | null;
  labFlag: LabFlag | null;
};

export type FluidSampleInput = {
  componentId: string | null;
  fluidType: FluidType;
  /** ISO timestamp; null = now. */
  sampledAt: string | null;
  assetHours: number | null;
  fluidHours: number | null;
  fluidDistance: number | null;
  fluidDistanceUnit: "km" | "mi" | null;
  labName: string | null;
  labReportNumber: string | null;
  labStatus: LabStatus;
  notes: string | null;
  results: FluidSampleResultInput[];
};

function optionalText(value: unknown, label: string, max: number): Validation<string | null> {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: `${label} is invalid.` };
  const text = value.trim();
  if (!text) return { ok: true, value: null };
  if (text.length > max) return { ok: false, error: `${label} must be ${max} characters or fewer.` };
  return { ok: true, value: text };
}

function optionalNumber(
  value: unknown,
  label: string,
  options: { min: number; max: number; integer?: boolean },
): Validation<number | null> {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
  if (!Number.isFinite(parsed)) return { ok: false, error: `${label} must be a number.` };
  if (options.integer && !Number.isInteger(parsed)) {
    return { ok: false, error: `${label} must be a whole number.` };
  }
  if (parsed < options.min || parsed > options.max) {
    return { ok: false, error: `${label} is outside the allowed range.` };
  }
  return { ok: true, value: parsed };
}

function sampledAtValue(value: unknown, now: number): Validation<string | null> {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: "Sample date is invalid." };
  // A plain date is the sample day (noon UTC keeps it on that day everywhere).
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00.000Z` : value;
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return { ok: false, error: "Sample date is invalid." };
  if (time > now + 24 * 60 * 60 * 1000) return { ok: false, error: "A sample cannot be dated in the future." };
  return { ok: true, value: new Date(time).toISOString() };
}

/** Validate a record-sample request body (the operation key is checked separately). */
export function validateFluidSample(body: unknown, now = Date.now()): Validation<FluidSampleInput> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "A fluid sample is required." };
  }
  const input = body as Record<string, unknown>;

  if (!isFluidType(input.fluidType)) return { ok: false, error: "Select the fluid sampled." };
  const fluidType = input.fluidType;

  let componentId: string | null = null;
  if (input.componentId !== undefined && input.componentId !== null && input.componentId !== "") {
    if (typeof input.componentId !== "string" || !UUID_PATTERN.test(input.componentId)) {
      return { ok: false, error: "Select one of this asset's components." };
    }
    componentId = input.componentId;
  }

  const labStatus = input.labStatus === undefined || input.labStatus === null || input.labStatus === ""
    ? "unknown"
    : input.labStatus;
  if (!isLabStatus(labStatus)) return { ok: false, error: "Select the lab's reported status." };

  const sampledAt = sampledAtValue(input.sampledAt, now);
  if (!sampledAt.ok) return sampledAt;
  const assetHours = optionalNumber(input.assetHours, "Asset hours", { min: 0, max: 10_000_000, integer: true });
  if (!assetHours.ok) return assetHours;
  const fluidHours = optionalNumber(input.fluidHours, "Fluid hours", { min: 0, max: 1_000_000 });
  if (!fluidHours.ok) return fluidHours;
  const fluidDistance = optionalNumber(input.fluidDistance, "Fluid distance", { min: 0, max: 10_000_000 });
  if (!fluidDistance.ok) return fluidDistance;
  let fluidDistanceUnit: "km" | "mi" | null = null;
  if (fluidDistance.value !== null) {
    if (input.fluidDistanceUnit !== "km" && input.fluidDistanceUnit !== "mi") {
      return { ok: false, error: "Select km or mi for the fluid distance." };
    }
    fluidDistanceUnit = input.fluidDistanceUnit;
  }
  const labName = optionalText(input.labName, "Lab name", 120);
  if (!labName.ok) return labName;
  const labReportNumber = optionalText(input.labReportNumber, "Lab report number", 80);
  if (!labReportNumber.ok) return labReportNumber;
  const notes = optionalText(input.notes, "Notes", 2000);
  if (!notes.ok) return notes;

  const rawResults = input.results === undefined || input.results === null ? [] : input.results;
  if (!Array.isArray(rawResults)) return { ok: false, error: "Results are invalid." };
  if (rawResults.length > MAX_FLUID_RESULTS) {
    return { ok: false, error: `Enter at most ${MAX_FLUID_RESULTS} results per sample.` };
  }
  const results: FluidSampleResultInput[] = [];
  const seen = new Set<string>();
  for (const [index, raw] of rawResults.entries()) {
    const row = index + 1;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, error: `Result ${row} is invalid.` };
    }
    const entry = raw as Record<string, unknown>;
    const analyte = normalizeAnalyte(entry.analyte);
    if (!analyte) return { ok: false, error: `Result ${row}: enter the analyte name.` };
    if (seen.has(analyte)) {
      return { ok: false, error: `${analyteLabel(analyte)} is entered more than once.` };
    }
    seen.add(analyte);
    const value = optionalNumber(entry.value, `${analyteLabel(analyte)} value`, {
      min: -1_000_000_000,
      max: 1_000_000_000,
    });
    if (!value.ok) return value;
    if (value.value === null) return { ok: false, error: `Enter a value for ${analyteLabel(analyte)}.` };
    const unit = optionalText(entry.unit, `${analyteLabel(analyte)} unit`, 24);
    if (!unit.ok) return unit;
    const flag = entry.labFlag === undefined || entry.labFlag === null || entry.labFlag === "" ? null : entry.labFlag;
    if (flag !== null && !isLabFlag(flag)) {
      return { ok: false, error: `${analyteLabel(analyte)}: select the lab's flag.` };
    }
    results.push({ analyte, value: value.value, unit: unit.value, labFlag: flag });
  }

  return {
    ok: true,
    value: {
      componentId,
      fluidType,
      sampledAt: sampledAt.value,
      assetHours: assetHours.value,
      fluidHours: fluidHours.value,
      fluidDistance: fluidDistance.value,
      fluidDistanceUnit,
      labName: labName.value,
      labReportNumber: labReportNumber.value,
      labStatus,
      notes: notes.value,
      results,
    },
  };
}

// ---------------------------------------------------------------------------
// History and trends (arithmetic only)
// ---------------------------------------------------------------------------

export type FluidSampleResult = {
  analyte: string;
  value: number;
  unit: string | null;
  labFlag: LabFlag | null;
};

export type FluidSample = {
  id: string;
  sequence: number;
  componentId: string | null;
  componentName: string | null;
  fluidType: string;
  sampledAt: string;
  assetHours: number | null;
  fluidHours: number | null;
  fluidDistance: number | null;
  fluidDistanceUnit: string | null;
  labName: string | null;
  labReportNumber: string | null;
  labStatus: string;
  notes: string | null;
  recordedBy: string | null;
  createdAt: string;
  voided: { at: string; reason: string } | null;
  results: FluidSampleResult[];
};

export type AnalyteTrendPoint = {
  sampleId: string;
  sampledAt: string;
  value: number;
  unit: string | null;
  labFlag: LabFlag | null;
  fluidHours: number | null;
};

export type AnalyteTrend = {
  analyte: string;
  label: string;
  latest: AnalyteTrendPoint;
  previous: AnalyteTrendPoint | null;
  /** latest − previous; null without a previous value in the same unit. */
  change: number | null;
  /** Fluid hours between the two samples (only when the fluid was not changed between them). */
  fluidHoursBetween: number | null;
  /** change ÷ fluid hours between × 100; null when not computable. */
  changePer100FluidHours: number | null;
};

export type FluidSampleGroup = {
  key: string;
  componentId: string | null;
  componentName: string | null;
  fluidType: string;
  label: string;
  /** Live samples, newest first. */
  samples: FluidSample[];
  /** Voided samples (kept for history), newest first. */
  voided: FluidSample[];
  latest: FluidSample | null;
  trends: AnalyteTrend[];
};

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function newestFirst(a: FluidSample, b: FluidSample): number {
  return Date.parse(b.sampledAt) - Date.parse(a.sampledAt) || b.sequence - a.sequence;
}

export function fluidGroupKey(sample: Pick<FluidSample, "componentId" | "fluidType">): string {
  return `${sample.componentId ?? "asset"}:${sample.fluidType}`;
}

export function fluidGroupLabel(sample: Pick<FluidSample, "componentName" | "fluidType">): string {
  return fluidTypeLabel(sample.fluidType) + (sample.componentName ? ` · ${sample.componentName}` : "");
}

function trendPoint(sample: FluidSample, result: FluidSampleResult): AnalyteTrendPoint {
  return {
    sampleId: sample.id,
    sampledAt: sample.sampledAt,
    value: result.value,
    unit: result.unit,
    labFlag: result.labFlag,
    fluidHours: sample.fluidHours,
  };
}

/**
 * Per-analyte trend across live samples (newest first): latest value, the
 * previous value of the same analyte, and their plain difference. The rate per
 * 100 fluid hours is given only when both samples carry fluid hours and the
 * hours increased (same fill of fluid); a fluid change resets the count, so no
 * rate is computed across it.
 */
export function analyteTrends(liveNewestFirst: FluidSample[]): AnalyteTrend[] {
  const order: string[] = [];
  const points = new Map<string, AnalyteTrendPoint[]>();
  for (const sample of liveNewestFirst) {
    for (const result of sample.results) {
      const list = points.get(result.analyte);
      if (list) list.push(trendPoint(sample, result));
      else {
        order.push(result.analyte);
        points.set(result.analyte, [trendPoint(sample, result)]);
      }
    }
  }
  return order.map((analyte) => {
    const [latest, previous = null] = points.get(analyte)!;
    const sameUnit = previous !== null && (latest.unit ?? "") === (previous.unit ?? "");
    const change = previous && sameUnit ? round(latest.value - previous.value) : null;
    const fluidHoursBetween =
      previous && latest.fluidHours !== null && previous.fluidHours !== null && latest.fluidHours > previous.fluidHours
        ? round(latest.fluidHours - previous.fluidHours)
        : null;
    return {
      analyte,
      label: analyteLabel(analyte),
      latest,
      previous,
      change,
      fluidHoursBetween,
      changePer100FluidHours:
        change !== null && fluidHoursBetween !== null ? round((change / fluidHoursBetween) * 100) : null,
    };
  });
}

/** Group samples by component and fluid type, with per-analyte trends. */
export function buildFluidHistory(samples: FluidSample[]): FluidSampleGroup[] {
  const groups = new Map<string, FluidSample[]>();
  for (const sample of samples) {
    const key = fluidGroupKey(sample);
    const list = groups.get(key);
    if (list) list.push(sample);
    else groups.set(key, [sample]);
  }
  const result: FluidSampleGroup[] = [];
  for (const [key, list] of groups) {
    const sorted = [...list].sort(newestFirst);
    const live = sorted.filter((sample) => !sample.voided);
    const first = sorted[0];
    result.push({
      key,
      componentId: first.componentId,
      componentName: first.componentName,
      fluidType: first.fluidType,
      label: fluidGroupLabel(first),
      samples: live,
      voided: sorted.filter((sample) => sample.voided),
      latest: live[0] ?? null,
      trends: analyteTrends(live),
    });
  }
  return result.sort((a, b) => a.label.localeCompare(b.label));
}

export type FluidSampleSummary = {
  key: string;
  label: string;
  fluidType: string;
  componentName: string | null;
  sampleId: string;
  sampledAt: string;
  labStatus: string;
  labReportNumber: string | null;
  labName: string | null;
};

/** Latest live sample per component + fluid type (for Asset Health). */
export function latestFluidSampleSummaries(
  samples: Array<Omit<FluidSample, "results"> & { results?: FluidSampleResult[] }>,
): FluidSampleSummary[] {
  const latest = new Map<string, (typeof samples)[number]>();
  for (const sample of samples) {
    if (sample.voided) continue;
    const key = fluidGroupKey(sample);
    const current = latest.get(key);
    const newer = current
      ? Date.parse(sample.sampledAt) - Date.parse(current.sampledAt) || sample.sequence - current.sequence
      : 1;
    if (newer > 0) {
      latest.set(key, sample);
    }
  }
  return Array.from(latest.entries())
    .map(([key, sample]) => ({
      key,
      label: fluidGroupLabel(sample),
      fluidType: sample.fluidType,
      componentName: sample.componentName,
      sampleId: sample.id,
      sampledAt: sample.sampledAt,
      labStatus: sample.labStatus,
      labReportNumber: sample.labReportNumber,
      labName: sample.labName,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
