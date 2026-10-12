import {
  offRoadEquipmentProfiles,
  offRoadProfileByValue,
  type OffRoadEquipmentFamily,
} from "@/features/inspections/lib/inspection/offRoadInspectionCatalog";

/**
 * Equipment "Asset" domain vocabulary.
 *
 * An Asset is the canonical `vehicles` record seen through the Equipment
 * product. The mature table name stays `vehicles`; the service/UI layer calls
 * it an Asset. Equipment-specific data lives in the optional 1:1
 * `equipment_asset_profiles` row. Identity that already exists on `vehicles`
 * (make/model/year, VIN, unit number, engine hours, odometer, customer) stays
 * canonical there and is never duplicated on the profile.
 */

export const ASSET_PRIMARY_METERS = ["hours", "odometer", "cycles", "none"] as const;
export type AssetPrimaryMeter = (typeof ASSET_PRIMARY_METERS)[number];

export const ASSET_OPERATING_STATUSES = [
  "operational",
  "limited",
  "down",
  "standby",
  "out_of_service",
  "retired",
] as const;
export type AssetOperatingStatus = (typeof ASSET_OPERATING_STATUSES)[number];

export const ASSET_OPERATING_STATUS_LABELS: Record<AssetOperatingStatus, string> = {
  operational: "Operational",
  limited: "Limited / restricted",
  down: "Down",
  standby: "Standby",
  out_of_service: "Out of service",
  retired: "Retired",
};

export const ASSET_PRIMARY_METER_LABELS: Record<AssetPrimaryMeter, string> = {
  hours: "Engine hours",
  odometer: "Odometer",
  cycles: "Cycles",
  none: "No meter",
};

/** Canonical Equipment class options, shared with the off-road inspection catalog. */
export const ASSET_EQUIPMENT_CLASS_OPTIONS = offRoadEquipmentProfiles.map(
  (profile) => ({
    value: profile.value,
    label: profile.label,
    family: profile.family,
  }),
);

export type AssetIdentity = {
  id: string;
  unitNumber: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  vin: string | null;
  engineHours: number | null;
  odometer: string | null;
  odometerUnit: string | null;
  customerId: string | null;
};

export type EquipmentAssetProfile = {
  assetId: string;
  equipmentClass: string;
  equipmentClassLabel: string;
  equipmentFamily: OffRoadEquipmentFamily;
  serialNumber: string | null;
  pin: string | null;
  engineMake: string | null;
  engineModel: string | null;
  engineSerial: string | null;
  primaryMeter: AssetPrimaryMeter;
  currentCycles: number | null;
  metersUpdatedAt: string | null;
  siteName: string | null;
  operatingStatus: AssetOperatingStatus;
  mountedOnAssetId: string | null;
  attributes: Record<string, string | number | boolean | null>;
  updatedAt: string;
};

export type EquipmentAssetRecord = {
  asset: AssetIdentity;
  profile: EquipmentAssetProfile | null;
};

export type EquipmentAssetProfileMutation = {
  equipmentClass: string;
  equipmentFamily: OffRoadEquipmentFamily;
  serialNumber: string | null;
  pin: string | null;
  engineMake: string | null;
  engineModel: string | null;
  engineSerial: string | null;
  primaryMeter: AssetPrimaryMeter;
  currentCycles: number | null;
  siteName: string | null;
  operatingStatus: AssetOperatingStatus;
  mountedOnAssetId: string | null;
  attributes: Record<string, string | number | boolean | null>;
  /**
   * Canonical vehicles meters. Present only when the user deliberately edited
   * them; `expected` is the value the edit was made against, so a newer
   * reading recorded elsewhere is never silently reverted.
   */
  engineHours?: { value: number | null; expected: number | null };
  odometer?: { value: string | null; expected: string | null };
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ATTRIBUTE_KEY = /^[a-z][a-z0-9_]{0,63}$/;
const MAX_ATTRIBUTES = 50;

export function isAssetId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

function optionalText(
  value: unknown,
  field: string,
  max: number,
): Validation<string | null> {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: `${field} must be text.` };
  const trimmed = value.trim();
  if (trimmed.length > max) {
    return { ok: false, error: `${field} must be ${max} characters or fewer.` };
  }
  return { ok: true, value: trimmed || null };
}

/** The caller's exact baseline text (untrimmed) for an optimistic compare. */
function rawText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function optionalNonNegative(
  value: unknown,
  field: string,
  integer: boolean,
): Validation<number | null> {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: null };
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || (integer && !Number.isInteger(parsed))) {
    return {
      ok: false,
      error: `${field} must be a non-negative ${integer ? "whole number" : "number"}.`,
    };
  }
  return { ok: true, value: parsed };
}

function oneOf<T extends string>(
  value: unknown,
  options: readonly T[],
  fallback: T,
  field: string,
): Validation<T> {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: fallback };
  }
  return typeof value === "string" && (options as readonly string[]).includes(value)
    ? { ok: true, value: value as T }
    : { ok: false, error: `${field} is not a recognized value.` };
}

function validateAttributes(
  value: unknown,
): Validation<Record<string, string | number | boolean | null>> {
  if (value === undefined || value === null) return { ok: true, value: {} };
  if (typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Attributes must be an object." };
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > MAX_ATTRIBUTES) {
    return { ok: false, error: `Up to ${MAX_ATTRIBUTES} attributes are supported.` };
  }
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, raw] of entries) {
    if (!ATTRIBUTE_KEY.test(key)) {
      return { ok: false, error: `Attribute "${key}" has an invalid name.` };
    }
    if (typeof raw === "string") {
      if (raw.length > 500) {
        return { ok: false, error: `Attribute "${key}" is too long.` };
      }
      out[key] = raw;
    } else if (
      raw === null ||
      typeof raw === "boolean" ||
      (typeof raw === "number" && Number.isFinite(raw))
    ) {
      out[key] = raw;
    } else {
      return { ok: false, error: `Attribute "${key}" must be text, a number or yes/no.` };
    }
  }
  return { ok: true, value: out };
}

/**
 * Validate an Equipment profile mutation. The family is always derived from
 * the canonical class catalog, never trusted from the client.
 */
export function validateEquipmentAssetProfileMutation(
  body: unknown,
  assetId: string,
): Validation<EquipmentAssetProfileMutation> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "A profile body is required." };
  }
  const input = body as Record<string, unknown>;

  const classProfile = offRoadProfileByValue(
    typeof input.equipmentClass === "string" ? input.equipmentClass : null,
  );
  if (!classProfile) {
    return { ok: false, error: "Select a recognized equipment class." };
  }

  const texts = {
    serialNumber: optionalText(input.serialNumber, "Serial number", 120),
    pin: optionalText(input.pin, "PIN", 120),
    engineMake: optionalText(input.engineMake, "Engine make", 120),
    engineModel: optionalText(input.engineModel, "Engine model", 120),
    engineSerial: optionalText(input.engineSerial, "Engine serial", 120),
    siteName: optionalText(input.siteName, "Site", 200),
  };
  for (const result of Object.values(texts)) {
    if (!result.ok) return result;
  }
  const text = (result: Validation<string | null>) => (result.ok ? result.value : null);

  const primaryMeter = oneOf(input.primaryMeter, ASSET_PRIMARY_METERS, "hours", "Primary meter");
  if (!primaryMeter.ok) return primaryMeter;
  const operatingStatus = oneOf(
    input.operatingStatus,
    ASSET_OPERATING_STATUSES,
    "operational",
    "Operating status",
  );
  if (!operatingStatus.ok) return operatingStatus;

  const currentCycles = optionalNonNegative(input.currentCycles, "Cycles", true);
  if (!currentCycles.ok) return currentCycles;

  let mountedOnAssetId: string | null = null;
  if (input.mountedOnAssetId !== undefined && input.mountedOnAssetId !== null && input.mountedOnAssetId !== "") {
    if (!isAssetId(input.mountedOnAssetId)) {
      return { ok: false, error: "Mounted-on asset is invalid." };
    }
    if (input.mountedOnAssetId === assetId) {
      return { ok: false, error: "An asset cannot be mounted on itself." };
    }
    mountedOnAssetId = input.mountedOnAssetId;
  }

  const attributes = validateAttributes(input.attributes);
  if (!attributes.ok) return attributes;

  const value: EquipmentAssetProfileMutation = {
    equipmentClass: classProfile.value,
    equipmentFamily: classProfile.family,
    serialNumber: text(texts.serialNumber),
    pin: text(texts.pin),
    engineMake: text(texts.engineMake),
    engineModel: text(texts.engineModel),
    engineSerial: text(texts.engineSerial),
    primaryMeter: primaryMeter.value,
    currentCycles: currentCycles.value,
    siteName: text(texts.siteName),
    operatingStatus: operatingStatus.value,
    mountedOnAssetId,
    attributes: attributes.value,
  };

  if (Object.prototype.hasOwnProperty.call(input, "engineHours")) {
    // vehicles.engine_hours is an integer column.
    const hours = optionalNonNegative(input.engineHours, "Engine hours", true);
    if (!hours.ok) return hours;
    const expected = optionalNonNegative(input.expectedEngineHours, "Engine hours", true);
    if (!expected.ok) return expected;
    value.engineHours = { value: hours.value, expected: expected.value };
  }
  if (Object.prototype.hasOwnProperty.call(input, "odometer")) {
    // vehicles.mileage is canonical text (e.g. "42,000 km"); keep it as text.
    const odometer = optionalText(input.odometer, "Odometer", 40);
    if (!odometer.ok) return odometer;
    const expected = optionalText(input.expectedOdometer, "Odometer", 200);
    if (!expected.ok) return expected;
    value.odometer = { value: odometer.value, expected: rawText(input.expectedOdometer) };
  }

  return { ok: true, value };
}

export function equipmentClassLabel(value: string): string {
  return offRoadProfileByValue(value)?.label ?? value;
}
