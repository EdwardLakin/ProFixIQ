import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import { canManageComponents, canRecordComponentWork } from "@/features/equipment/lib/components";
import {
  buildMeterTimeline,
  METER_RATE_WINDOW_DAYS,
  METER_READING_SOURCES,
  meterUsageRates,
  preferredDistanceUnit,
  projectPmDue,
  validateMeterReading,
  type AssetMeters,
  type MeterReading,
  type MeterReadingSource,
  type MeterTimelineEntry,
} from "@/features/equipment/lib/meters";
import { evaluatePmPlan, validateVoidReason, type PmMeters } from "@/features/equipment/lib/pm";
import { authorizeEquipmentAsset } from "@/features/equipment/server/equipmentAssetProfileService";
import { loadAssetPm } from "@/features/equipment/server/equipmentPmService";
import type { CanonicalRole } from "@/features/shared/lib/rbac";
import {
  workOrderHref,
  workOrderTitle,
  type SearchWorkOrderRow,
} from "@/features/vehicles/server/searchShopVehicleRecords";

type DB = Database;
type ReadingRow = DB["public"]["Tables"]["equipment_meter_readings"]["Row"];

const READING_COLUMNS =
  "id,shop_id,sequence,vehicle_id,read_at,engine_hours,odometer,odometer_unit,cycles,source,notes,recorded_by,created_at,voided_at,voided_by,void_reason";
const WORK_ORDER_COLUMNS =
  "id,custom_id,status,record_type,estimate_number,estimate_status,created_at,odometer_km";
const HISTORY_LIMIT = 200;
const RATE_LIMIT = 5_000;
const WORK_ORDER_LIMIT = 1_000;

export class EquipmentMeterError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 500,
  ) {
    super(message);
  }
}

function numberOrNull(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function mapMeterReading(row: ReadingRow): MeterReading {
  const odometer = numberOrNull(row.odometer);
  const unit = row.odometer_unit === "km" || row.odometer_unit === "mi" ? row.odometer_unit : null;
  return {
    id: row.id,
    sequence: Number(row.sequence),
    readAt: row.read_at,
    engineHours: numberOrNull(row.engine_hours),
    odometer: odometer !== null && unit ? { value: odometer, unit } : null,
    cycles: numberOrNull(row.cycles),
    source: (METER_READING_SOURCES as readonly string[]).includes(row.source)
      ? (row.source as MeterReadingSource)
      : "manual",
    notes: row.notes,
    recordedBy: row.recorded_by,
    createdAt: row.created_at,
    voided: row.voided_at ? { at: row.voided_at, reason: row.void_reason ?? "" } : null,
  };
}

async function readRecentReadings(
  admin: SupabaseClient<DB>,
  shopId: string,
  assetId: string,
  limit: number,
): Promise<ReadingRow[]> {
  const { data, error } = await admin
    .from("equipment_meter_readings")
    .select(READING_COLUMNS)
    .eq("shop_id", shopId)
    .eq("vehicle_id", assetId)
    .order("read_at", { ascending: false })
    .order("sequence", { ascending: false })
    .limit(limit);
  if (error) throw new EquipmentMeterError("Unable to load meter readings.", 500);
  return (data ?? []) as ReadingRow[];
}

async function readRateReadings(
  admin: SupabaseClient<DB>,
  shopId: string,
  assetId: string,
): Promise<ReadingRow[]> {
  const { data, error } = await admin
    .from("equipment_meter_readings")
    .select(READING_COLUMNS)
    .eq("shop_id", shopId)
    .eq("vehicle_id", assetId)
    .order("read_at", { ascending: false })
    .order("sequence", { ascending: false })
    .limit(RATE_LIMIT);
  if (error) throw new EquipmentMeterError("Unable to load meter readings.", 500);
  return (data ?? []) as ReadingRow[];
}

function latestMeters(profile: PmMeters, timeline: MeterTimelineEntry[]): PmMeters {
  const live = timeline.filter((entry) => !entry.voided);
  const hoursEntry = live.find((entry) => entry.hours !== null);
  const distanceEntry = live.find((entry) => entry.distance !== null);
  const cyclesEntry = live.find((entry) => entry.cycles !== null);
  const newest = live.find((entry) => entry.hours !== null || entry.distance !== null || entry.cycles !== null);
  return {
    ...profile,
    hours: hoursEntry?.hours ?? profile.hours,
    distance: distanceEntry?.distance ?? profile.distance,
    cycles: cyclesEntry?.cycles ?? profile.cycles,
    updatedAt: newest?.at ?? profile.updatedAt,
  };
}

/**
 * Meter history for an asset: manual readings, PM completion meters and
 * dated work-order odometers, the usage rate over the last
 * METER_RATE_WINDOW_DAYS days, and when each active PM plan would come due at
 * that rate. The visible history and the rate input are both intentionally
 * bounded so telematics history cannot make the asset page grow without
 * bound. meterUsageRates applies the exact 90-day time window in memory.
 */
export async function loadAssetMeters(input: {
  supabase: SupabaseClient<DB>;
  admin: SupabaseClient<DB>;
  shopId: string;
  role: CanonicalRole;
  assetId: string;
  now?: number;
}): Promise<AssetMeters | null> {
  const pm = await loadAssetPm(input);
  if (!pm) return null;
  const now = input.now ?? Date.now();

  const [historyRows, rateRows, workOrdersResult] = await Promise.all([
    readRecentReadings(input.admin, input.shopId, input.assetId, HISTORY_LIMIT),
    readRateReadings(input.admin, input.shopId, input.assetId),
    input.supabase
      .from("work_orders")
      .select(WORK_ORDER_COLUMNS)
      .eq("shop_id", input.shopId)
      .eq("vehicle_id", input.assetId)
      .order("created_at", { ascending: false })
      .limit(WORK_ORDER_LIMIT),
  ]);
  if (workOrdersResult.error) throw new EquipmentMeterError("Unable to load work orders.", 500);

  const workOrders = (workOrdersResult.data ?? []).map((row) => {
    const searchRow = row as unknown as SearchWorkOrderRow;
    return {
      id: row.id,
      label: workOrderTitle(searchRow),
      href: workOrderHref(searchRow),
      createdAt: row.created_at,
      odometerKm: row.odometer_km,
    };
  });
  const completions = pm.plans.flatMap((status) =>
    status.history.map((completion) => ({ completion, planName: status.plan.name })),
  );
  const timeline = buildMeterTimeline({
    readings: historyRows.map(mapMeterReading),
    completions,
    workOrders,
  });
  const rateTimeline = buildMeterTimeline({
    readings: rateRows.map(mapMeterReading),
    completions,
    workOrders,
  });
  const current = latestMeters(pm.meters, timeline);
  const distanceUnit = current.distance?.unit ?? preferredDistanceUnit(rateTimeline);
  const rates = meterUsageRates(rateTimeline, {
    now,
    windowDays: METER_RATE_WINDOW_DAYS,
    distanceUnit,
  });
  const plans = pm.plans.map((status) => evaluatePmPlan(status.plan, status.history, current));

  return {
    current,
    timeline,
    distanceUnit,
    windowDays: METER_RATE_WINDOW_DAYS,
    rates,
    projections: projectPmDue(plans, rates, current.today),
  };
}

type WriteContext = {
  supabase: SupabaseClient<DB>;
  admin: SupabaseClient<DB>;
  shopId: string;
  role: CanonicalRole;
  actorUserId: string;
};

function rpcFailure(
  scope: string,
  error: { code?: string | null; message: string },
  messages: { notFound: string; fallback: string },
): never {
  if (error.code === "P0002") throw new EquipmentMeterError(messages.notFound, 404);
  if (error.code === "22023" || error.code === "23514" || error.code === "23502") {
    const message = /operation key/i.test(error.message)
      ? "This request was already used for a different change. Reload and try again."
      : /already voided/i.test(error.message)
        ? "This reading is already voided."
        : "The meter reading is invalid.";
    throw new EquipmentMeterError(message, 400);
  }
  console.error(`[equipment/meters] ${scope} failed`, { code: error.code ?? null, message: error.message });
  throw new EquipmentMeterError(messages.fallback, 500);
}

function requireOperationKey(body: unknown): string {
  const key = (body as { operationKey?: unknown } | null)?.operationKey;
  if (typeof key !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) {
    throw new EquipmentMeterError("An operation key is required.", 400);
  }
  return key;
}

/**
 * Record a dated meter reading. Component work recorders (mechanics only on
 * assets they are assigned to). Never changes the asset's current meters.
 */
export async function recordMeterReading(
  context: WriteContext & { assetId: string; body: unknown; now?: number },
): Promise<{ id: string }> {
  if (!canRecordComponentWork(context.role)) {
    throw new EquipmentMeterError("Your role cannot record meter readings.", 403);
  }
  const operationKey = requireOperationKey(context.body);
  const validation = validateMeterReading(context.body, context.now);
  if (!validation.ok) throw new EquipmentMeterError(validation.error, 400);
  const asset = await authorizeEquipmentAsset({ ...context, assetId: context.assetId });
  if (!asset) throw new EquipmentMeterError("Asset not found.", 404);

  const reading = validation.value;
  const { data, error } = await context.admin.rpc("equipment_meter_reading_record", {
    p_shop_id: context.shopId,
    p_actor_user_id: context.actorUserId,
    p_vehicle_id: context.assetId,
    p_reading: {
      read_at: reading.readAt,
      engine_hours: reading.engineHours,
      odometer: reading.odometer,
      odometer_unit: reading.odometerUnit,
      cycles: reading.cycles,
      source: reading.source,
      notes: reading.notes,
    },
    p_operation_key: operationKey,
  });
  if (error) {
    rpcFailure("record", error, { notFound: "Asset not found.", fallback: "The reading could not be recorded." });
  }
  return { id: (data as { id: string }).id };
}

/** Void a mistaken reading with a reason (component managers only). */
export async function voidMeterReading(
  context: WriteContext & { readingId: string; body: unknown },
): Promise<{ id: string }> {
  if (!canManageComponents(context.role)) {
    throw new EquipmentMeterError("Your role cannot void meter readings.", 403);
  }
  const operationKey = requireOperationKey(context.body);
  const reason = validateVoidReason((context.body as { reason?: unknown }).reason);
  if (!reason.ok) throw new EquipmentMeterError(reason.error, 400);

  const { data: row, error } = await context.admin
    .from("equipment_meter_readings")
    .select("id,vehicle_id")
    .eq("shop_id", context.shopId)
    .eq("id", context.readingId)
    .maybeSingle();
  if (error) throw new EquipmentMeterError("Unable to load the reading.", 500);
  if (!row) throw new EquipmentMeterError("Reading not found.", 404);
  const asset = await authorizeEquipmentAsset({ ...context, assetId: row.vehicle_id });
  if (!asset) throw new EquipmentMeterError("Reading not found.", 404);

  const { data, error: rpcError } = await context.admin.rpc("equipment_meter_reading_void", {
    p_shop_id: context.shopId,
    p_actor_user_id: context.actorUserId,
    p_reading_id: context.readingId,
    p_reason: reason.value,
    p_operation_key: operationKey,
  });
  if (rpcError) {
    rpcFailure("void", rpcError, { notFound: "Reading not found.", fallback: "The reading could not be voided." });
  }
  return { id: (data as { id: string }).id };
}