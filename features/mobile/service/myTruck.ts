import type { Database } from "@shared/types/types/supabase";

export const FIELD_TRUCK_RECORD_TYPES = [
  "odometer",
  "maintenance",
  "expense",
  "reminder",
  "downtime",
  "document",
] as const;

export type FieldTruckRecordType = (typeof FIELD_TRUCK_RECORD_TYPES)[number];
export type FieldTruckRecord =
  Database["public"]["Tables"]["field_truck_records"]["Row"];

export type FieldTruckVehicle = {
  id: string;
  name: string;
  unitNumber: string | null;
};

export type FieldMyTruckSnapshot = {
  truck: FieldTruckVehicle | null;
  records: FieldTruckRecord[];
  alerts: FieldTruckRecord[];
  summary: {
    latestOdometer: number | null;
    odometerUnit: string | null;
    openReminders: number;
    activeDowntime: number;
    monthCostsByCurrency: Array<{ currency: string; amount: number }>;
  };
};

export function isFieldTruckRecordType(
  value: unknown,
): value is FieldTruckRecordType {
  return FIELD_TRUCK_RECORD_TYPES.includes(value as FieldTruckRecordType);
}

export function buildFieldMyTruckSummary(
  records: FieldTruckRecord[],
  now = new Date(),
): FieldMyTruckSnapshot["summary"] {
  const latestOdometer = records
    .filter(
      (record) =>
        record.odometer !== null &&
        ["odometer", "maintenance"].includes(record.record_type),
    )
    .sort((a, b) => {
      const aDate = a.occurred_on ?? a.created_at;
      const bDate = b.occurred_on ?? b.created_at;
      return bDate.localeCompare(aDate);
    })[0];
  const monthKey = now.toISOString().slice(0, 7);
  const monthCosts = new Map<string, number>();
  records.forEach((record) => {
    if (
      record.amount === null ||
      !["expense", "maintenance"].includes(record.record_type) ||
      !(record.occurred_on ?? record.created_at).startsWith(monthKey)
    ) {
      return;
    }
    const currency = record.currency ?? "CAD";
    monthCosts.set(currency, (monthCosts.get(currency) ?? 0) + Number(record.amount));
  });

  return {
    latestOdometer: latestOdometer?.odometer ?? null,
    odometerUnit: latestOdometer?.odometer_unit ?? null,
    openReminders: records.filter(
      (record) => record.record_type === "reminder" && record.status === "open",
    ).length,
    activeDowntime: records.filter(
      (record) =>
        record.record_type === "downtime" &&
        record.status === "open" &&
        record.ends_at === null,
    ).length,
    monthCostsByCurrency: [...monthCosts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, amount]) => ({ currency, amount })),
  };
}

export function toNullableText(value: unknown, maxLength = 2000): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

export function toNonNegativeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
