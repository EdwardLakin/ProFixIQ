import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import {
  canManageComponents,
  canRecordComponentWork,
} from "@/features/equipment/lib/components";
import {
  buildMeasurementSeries,
  isMeasurementType,
  MEASUREMENT_TYPES,
  toCanonical,
  type EquipmentMeasurement,
  type MeasurementAssetRef,
  type MeasurementBatch,
  type MeasurementCorrection,
  type MeasurementSeries,
} from "@/features/equipment/lib/measurements";
import { authorizeEquipmentAsset } from "@/features/equipment/server/equipmentAssetProfileService";
import type { CanonicalRole } from "@/features/shared/lib/rbac";

type DB = Database;
type MeasurementRow = DB["public"]["Tables"]["equipment_measurements"]["Row"];

const MEASUREMENT_COLUMNS =
  "id,shop_id,sequence,vehicle_id,component_id,measurement_type,position,value,unit,entered_value,entered_unit,asset_hours,measured_at,work_order_id,inspection_id,notes,corrects_measurement_id,voided,correction_reason,recorded_by,created_at";
const PAGE = 1_000;
const MAX_PAGES = 50;

export class EquipmentMeasurementError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 500,
  ) {
    super(message);
  }
}

function rpcFailure(error: { code?: string | null; message: string }): never {
  switch (error.code) {
    case "P0002":
      throw new EquipmentMeasurementError("Measurement not found.", 404);
    case "23505":
      throw new EquipmentMeasurementError("This reading was already corrected. Refresh and try again.", 409);
    case "23514":
      throw new EquipmentMeasurementError(
        /component must be installed on the asset at that time/i.test(error.message)
          ? "That component was not installed on this asset at that date."
          : /component must be installed/i.test(error.message)
          ? "That component is not installed on this asset."
          : /work order must be for/i.test(error.message)
            ? "That work order is for a different asset."
            : /inspection must be for/i.test(error.message)
              ? "That inspection is for a different asset."
              : /voided/i.test(error.message)
                ? "A voided reading cannot be corrected."
                : "That asset, component, work order or inspection is not in this shop.",
        409,
      );
    case "22023":
    case "22P02":
    case "22003":
      if (/different request/i.test(error.message)) {
        throw new EquipmentMeasurementError(
          "This request was already submitted with different values. Refresh and try again.",
          409,
        );
      }
      throw new EquipmentMeasurementError("The measurement request is invalid.", 400);
    default:
      console.error("[equipment/measurements] write failed", {
        code: error.code ?? null,
        message: error.message,
      });
      throw new EquipmentMeasurementError("The measurement could not be saved.", 500);
  }
}

function mapRow(
  row: MeasurementRow,
  componentNames: Map<string, string>,
  assets: Map<string, MeasurementAssetRef>,
): EquipmentMeasurement {
  return {
    id: row.id,
    sequence: Number(row.sequence),
    vehicleId: row.vehicle_id,
    asset: assets.get(row.vehicle_id) ?? null,
    measurementType: row.measurement_type,
    position: row.position,
    componentId: row.component_id,
    componentName: row.component_id ? componentNames.get(row.component_id) ?? null : null,
    value: Number(row.value),
    unit: row.unit,
    enteredValue: Number(row.entered_value),
    enteredUnit: row.entered_unit,
    assetHours: row.asset_hours,
    measuredAt: row.measured_at,
    workOrderId: row.work_order_id,
    inspectionId: row.inspection_id,
    notes: row.notes,
    correctsMeasurementId: row.corrects_measurement_id,
    voided: row.voided,
    correctionReason: row.correction_reason,
    recordedBy: row.recorded_by,
  };
}

async function readMeasurements(
  admin: SupabaseClient<DB>,
  shopId: string,
  filter: { column: "vehicle_id" | "component_id"; id: string },
  componentIds?: string[],
): Promise<MeasurementRow[]> {
  const rows: MeasurementRow[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    let query = admin
      .from("equipment_measurements")
      .select(MEASUREMENT_COLUMNS)
      .eq("shop_id", shopId)
      .eq(filter.column, filter.id);
    if (componentIds) query = query.in("component_id", componentIds);
    const { data, error } = await query
      .order("measured_at", { ascending: false })
      .order("sequence", { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new EquipmentMeasurementError("Unable to load measurements.", 500);
    rows.push(...((data ?? []) as MeasurementRow[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

async function componentNamesFor(
  admin: SupabaseClient<DB>,
  shopId: string,
  ids: string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await admin
      .from("equipment_components")
      .select("id,label")
      .eq("shop_id", shopId)
      .in("id", ids.slice(offset, offset + 100));
    if (error) throw new EquipmentMeasurementError("Unable to load components.", 500);
    for (const row of data ?? []) names.set(row.id, row.label);
  }
  return names;
}

function assetLabel(row: {
  unit_number: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
}): string {
  const machine = [row.year, row.make, row.model].filter(Boolean).join(" ");
  if (row.unit_number && machine) return `Unit ${row.unit_number} · ${machine}`;
  return row.unit_number ? `Unit ${row.unit_number}` : machine || "Asset";
}

/** Asset labels for readings, through the caller's RLS client (visible assets only). */
async function assetRefsFor(
  supabase: SupabaseClient<DB>,
  shopId: string,
  ids: string[],
): Promise<Map<string, MeasurementAssetRef>> {
  const refs = new Map<string, MeasurementAssetRef>();
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await supabase
      .from("vehicles")
      .select("id,unit_number,year,make,model")
      .eq("shop_id", shopId)
      .in("id", ids.slice(offset, offset + 100));
    if (error) throw new EquipmentMeasurementError("Unable to load assets.", 500);
    for (const vehicle of data ?? []) {
      refs.set(vehicle.id, { id: vehicle.id, label: assetLabel(vehicle), href: `/equipment/${vehicle.id}` });
    }
  }
  return refs;
}

async function toSeries(
  supabase: SupabaseClient<DB>,
  admin: SupabaseClient<DB>,
  shopId: string,
  rows: MeasurementRow[],
): Promise<MeasurementSeries[]> {
  const componentIds = Array.from(
    new Set(rows.map((row) => row.component_id).filter((id): id is string => Boolean(id))),
  );
  const vehicleIds = Array.from(new Set(rows.map((row) => row.vehicle_id)));
  const [names, assets] = await Promise.all([
    componentNamesFor(admin, shopId, componentIds),
    assetRefsFor(supabase, shopId, vehicleIds),
  ]);
  return buildMeasurementSeries(rows.map((row) => mapRow(row, names, assets)));
}

export type AssetMeasurements = {
  assetHours: number | null;
  series: MeasurementSeries[];
  /** Components installed on the asset, for recording against a component. */
  components: Array<{ id: string; label: string }>;
};

/**
 * Measurements recorded on an asset, grouped into series. The asset is
 * authorized with the vehicle-workspace rules (shop scope, mechanic
 * assignment) through the caller's RLS client before the privileged read.
 */
export async function loadAssetMeasurements(input: {
  supabase: SupabaseClient<DB>;
  admin: SupabaseClient<DB>;
  shopId: string;
  role: CanonicalRole;
  assetId: string;
}): Promise<AssetMeasurements | null> {
  const asset = await authorizeEquipmentAsset(input);
  if (!asset) return null;

  const rows = await readMeasurements(input.admin, input.shopId, {
    column: "vehicle_id",
    id: input.assetId,
  });
  const { data: installed, error } = await input.admin
    .from("equipment_components")
    .select("id,label")
    .eq("shop_id", input.shopId)
    .eq("installed_vehicle_id", input.assetId)
    .order("label", { ascending: true })
    .limit(PAGE);
  if (error) throw new EquipmentMeasurementError("Unable to load components.", 500);

  return {
    assetHours: asset.engineHours,
    series: await toSeries(input.supabase, input.admin, input.shopId, rows),
    components: (installed ?? []).map((row) => ({ id: row.id, label: row.label })),
  };
}

/**
 * Measurements recorded against one component, across every machine it was
 * on (shop-wide roles only; the caller enforces). Asset labels come through
 * the caller's RLS client.
 */
export async function loadComponentMeasurements(input: {
  supabase: SupabaseClient<DB>;
  admin: SupabaseClient<DB>;
  shopId: string;
  componentId: string;
}): Promise<MeasurementSeries[]> {
  const rows = await readMeasurements(input.admin, input.shopId, {
    column: "component_id",
    id: input.componentId,
  });
  return toSeries(input.supabase, input.admin, input.shopId, rows);
}

/**
 * Measurements recorded on an already-authorized asset against the given
 * components only (callers authorize the asset first). Corrections keep their
 * original's component, so correction chains stay complete.
 */
export async function loadAssetComponentMeasurements(input: {
  supabase: SupabaseClient<DB>;
  admin: SupabaseClient<DB>;
  shopId: string;
  assetId: string;
  componentIds: string[];
}): Promise<MeasurementSeries[]> {
  const rows: MeasurementRow[] = [];
  for (let offset = 0; offset < input.componentIds.length; offset += 100) {
    rows.push(
      ...(await readMeasurements(
        input.admin,
        input.shopId,
        { column: "vehicle_id", id: input.assetId },
        input.componentIds.slice(offset, offset + 100),
      )),
    );
  }
  return toSeries(input.supabase, input.admin, input.shopId, rows);
}

type WriteContext = {
  supabase: SupabaseClient<DB>;
  admin: SupabaseClient<DB>;
  shopId: string;
  role: CanonicalRole;
  actorUserId: string;
};

async function requireAsset(context: WriteContext, assetId: string) {
  const asset = await authorizeEquipmentAsset({ ...context, assetId });
  if (!asset) throw new EquipmentMeasurementError("Asset not found.", 404);
  return asset;
}

/**
 * Record readings taken together on an asset. Assigned technicians may record
 * on assets visible to them; the batch is atomic and retry-safe.
 */
export async function recordMeasurements(
  context: WriteContext & { assetId: string; batch: MeasurementBatch },
): Promise<string[]> {
  if (!canRecordComponentWork(context.role)) {
    throw new EquipmentMeasurementError("Your role cannot record measurements.", 403);
  }
  const asset = await requireAsset(context, context.assetId);
  const { batch } = context;

  if (batch.workOrderId) {
    const { data, error } = await context.supabase
      .from("work_orders")
      .select("id,vehicle_id")
      .eq("shop_id", context.shopId)
      .eq("id", batch.workOrderId)
      .maybeSingle();
    if (error) throw new EquipmentMeasurementError("Unable to load work order.", 500);
    if (!data) throw new EquipmentMeasurementError("Work order not found.", 400);
    if (data.vehicle_id !== asset.id) {
      throw new EquipmentMeasurementError("That work order is for a different asset.", 400);
    }
  }
  if (batch.inspectionId) {
    const { data, error } = await context.supabase
      .from("inspections")
      .select("id,vehicle_id,work_order_id,work_order_line_id")
      .eq("shop_id", context.shopId)
      .eq("id", batch.inspectionId)
      .maybeSingle();
    if (error) throw new EquipmentMeasurementError("Unable to load inspection.", 500);
    if (!data) throw new EquipmentMeasurementError("Inspection not found.", 400);
    // Inspections may carry their asset only through the work order or line.
    let inspectionVehicle = data.vehicle_id;
    if (!inspectionVehicle && data.work_order_id) {
      const { data: workOrder } = await context.supabase
        .from("work_orders")
        .select("vehicle_id")
        .eq("shop_id", context.shopId)
        .eq("id", data.work_order_id)
        .maybeSingle();
      inspectionVehicle = workOrder?.vehicle_id ?? null;
    }
    if (!inspectionVehicle && data.work_order_line_id) {
      const { data: line } = await context.supabase
        .from("work_order_lines")
        .select("vehicle_id")
        .eq("shop_id", context.shopId)
        .eq("id", data.work_order_line_id)
        .maybeSingle();
      inspectionVehicle = line?.vehicle_id ?? null;
    }
    if (inspectionVehicle !== asset.id) {
      throw new EquipmentMeasurementError("That inspection is for a different asset.", 400);
    }
  }

  const { data, error } = await context.admin.rpc("equipment_measurement_record", {
    p_shop_id: context.shopId,
    p_actor_user_id: context.actorUserId,
    p_vehicle_id: asset.id,
    p_items: batch.entries.map((entry) => ({
      measurement_type: entry.measurementType,
      position: entry.position,
      component_id: entry.componentId,
      value: entry.value,
      unit: entry.unit,
      entered_value: entry.enteredValue,
      entered_unit: entry.enteredUnit,
      notes: entry.notes,
    })),
    // A backdated reading uses the meter observed then (or none), never today's.
    p_asset_hours: (batch.measuredAt ? batch.assetHours : asset.engineHours) ?? undefined,
    p_measured_at: batch.measuredAt ?? undefined,
    p_work_order_id: batch.workOrderId ?? undefined,
    p_inspection_id: batch.inspectionId ?? undefined,
    p_operation_key: batch.operationKey,
  });
  if (error) rpcFailure(error);
  return Array.isArray(data) ? (data as string[]) : [];
}

/**
 * Correct or void a reading with a reason. Component managers may correct any
 * reading on an asset they can see; other recorders only their own.
 */
export async function correctMeasurement(
  context: WriteContext & { measurementId: string; correction: MeasurementCorrection },
): Promise<string> {
  if (!canRecordComponentWork(context.role)) {
    throw new EquipmentMeasurementError("Your role cannot correct measurements.", 403);
  }
  const { data: original, error } = await context.admin
    .from("equipment_measurements")
    .select(MEASUREMENT_COLUMNS)
    .eq("shop_id", context.shopId)
    .eq("id", context.measurementId)
    .maybeSingle();
  if (error) throw new EquipmentMeasurementError("Unable to load measurement.", 500);
  if (!original) throw new EquipmentMeasurementError("Measurement not found.", 404);
  const row = original as MeasurementRow;

  await requireAsset(context, row.vehicle_id);
  if (!canManageComponents(context.role) && row.recorded_by !== context.actorUserId) {
    throw new EquipmentMeasurementError("You can only correct readings you recorded.", 403);
  }

  const { correction } = context;
  let canonical: { value: number; unit: string } | null = null;
  if (!correction.void) {
    if (!isMeasurementType(row.measurement_type)) {
      throw new EquipmentMeasurementError("This measurement type can no longer be corrected.", 409);
    }
    canonical = toCanonical(row.measurement_type, correction.enteredValue, correction.enteredUnit);
    if (!canonical) throw new EquipmentMeasurementError("Select a unit for this measurement.", 400);
    const { min, max } = MEASUREMENT_TYPES[row.measurement_type];
    if (canonical.value < min || canonical.value > max) {
      throw new EquipmentMeasurementError("The value is outside the plausible range.", 400);
    }
  }

  const { data, error: rpcError } = await context.admin.rpc("equipment_measurement_correct", {
    p_shop_id: context.shopId,
    p_actor_user_id: context.actorUserId,
    p_measurement_id: context.measurementId,
    // Positional SQL parameters: null for a void (generated types omit nullability).
    p_value: (canonical?.value ?? null) as unknown as number,
    p_unit: (canonical?.unit ?? null) as unknown as string,
    p_entered_value: (correction.void ? null : correction.enteredValue) as unknown as number,
    p_entered_unit: (correction.void ? null : correction.enteredUnit) as unknown as string,
    p_void: correction.void,
    p_reason: correction.reason,
    p_operation_key: correction.operationKey,
  });
  if (rpcError) rpcFailure(rpcError);
  return data as string;
}
