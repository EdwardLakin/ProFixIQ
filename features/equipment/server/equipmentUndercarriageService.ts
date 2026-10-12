import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import { canManageComponents } from "@/features/equipment/lib/components";
import {
  isUndercarriagePart,
  measurementsForPart,
  sideLabel,
  UNDERCARRIAGE_PART_ORDER,
  validateWearLimit,
  wearReading,
  type Undercarriage,
  type UndercarriagePart,
  type UndercarriageSide,
  type WearLimit,
} from "@/features/equipment/lib/undercarriage";
import { authorizeEquipmentAsset } from "@/features/equipment/server/equipmentAssetProfileService";
import { loadAssetMeasurements } from "@/features/equipment/server/equipmentMeasurementService";
import type { CanonicalRole } from "@/features/shared/lib/rbac";

type DB = Database;
type ComponentRow = Pick<
  DB["public"]["Tables"]["equipment_components"]["Row"],
  "id" | "component_type" | "position" | "label" | "serial_number" | "parent_component_id"
>;
type LimitRow = DB["public"]["Tables"]["equipment_wear_limits"]["Row"];

export class EquipmentUndercarriageError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 500,
  ) {
    super(message);
  }
}

function mapLimit(row: LimitRow): WearLimit {
  return {
    id: row.id,
    componentId: row.component_id,
    measurementType: row.measurement_type,
    unit: row.unit,
    newValue: Number(row.new_value),
    limitValue: Number(row.limit_value),
    reference: row.reference,
    setAt: row.created_at,
  };
}

/** Current (latest) wear limit per component + measurement type. */
async function currentLimits(
  admin: SupabaseClient<DB>,
  shopId: string,
  componentIds: string[],
): Promise<Map<string, WearLimit>> {
  const limits = new Map<string, WearLimit>();
  for (let offset = 0; offset < componentIds.length; offset += 100) {
    const { data, error } = await admin
      .from("equipment_wear_limits")
      .select("id,shop_id,sequence,component_id,measurement_type,unit,new_value,limit_value,reference,created_by,created_at")
      .eq("shop_id", shopId)
      .in("component_id", componentIds.slice(offset, offset + 100))
      .order("sequence", { ascending: false })
      .limit(1_000);
    if (error) throw new EquipmentUndercarriageError("Unable to load wear limits.", 500);
    for (const row of (data ?? []) as LimitRow[]) {
      const key = `${row.component_id}|${row.measurement_type}`;
      if (!limits.has(key)) limits.set(key, mapLimit(row));
    }
  }
  return limits;
}

/**
 * The asset's undercarriage: each side with its parts, their latest readings,
 * wear limits and the resulting percent worn. Authorization (shop scope,
 * mechanic assignment) happens in loadAssetMeasurements before any privileged
 * read. Returns null when the asset is not visible.
 */
export async function loadUndercarriage(input: {
  supabase: SupabaseClient<DB>;
  admin: SupabaseClient<DB>;
  shopId: string;
  role: CanonicalRole;
  assetId: string;
}): Promise<Undercarriage | null> {
  const measurements = await loadAssetMeasurements(input);
  if (!measurements) return null;

  const { data, error } = await input.admin
    .from("equipment_components")
    .select("id,component_type,position,label,serial_number,parent_component_id")
    .eq("shop_id", input.shopId)
    .eq("installed_vehicle_id", input.assetId)
    .limit(1_000);
  if (error) throw new EquipmentUndercarriageError("Unable to load components.", 500);
  const components = ((data ?? []) as ComponentRow[]).filter((row) =>
    isUndercarriagePart(row.component_type),
  );
  if (!components.length) return { assetHours: measurements.assetHours, sides: [] };

  const limits = await currentLimits(
    input.admin,
    input.shopId,
    components.map((row) => row.id),
  );

  const part = (row: ComponentRow): UndercarriagePart => ({
    componentId: row.id,
    componentType: row.component_type,
    label: row.label,
    serialNumber: row.serial_number,
    readings: measurementsForPart(row.component_type).map((measurementType) => {
      const limit = limits.get(`${row.id}|${measurementType}`) ?? null;
      // Readings recorded against this component (any position); newest wins.
      const series =
        measurements.series
          .filter(
            (candidate) =>
              candidate.componentId === row.id && candidate.measurementType === measurementType,
          )
          .sort((a, b) => Date.parse(b.latest.measuredAt) - Date.parse(a.latest.measuredAt))[0] ??
        null;
      return {
        measurementType,
        limit,
        reading: series ? wearReading(series, limit) : null,
      };
    }),
  });

  const sideRows = components.filter((row) => row.component_type === "undercarriage");
  const sides: UndercarriageSide[] = sideRows.map((side) => ({
    position: side.position,
    sideComponentId: side.id,
    label: side.label || sideLabel(side.position),
    parts: [part(side)],
  }));
  const sideById = new Map(sides.map((side) => [side.sideComponentId, side]));

  const order = (type: string) => {
    const index = (UNDERCARRIAGE_PART_ORDER as readonly string[]).indexOf(type);
    return index === -1 ? UNDERCARRIAGE_PART_ORDER.length : index;
  };
  for (const row of components
    .filter((candidate) => candidate.component_type !== "undercarriage")
    .sort((a, b) => order(a.component_type) - order(b.component_type))) {
    let side = row.parent_component_id ? sideById.get(row.parent_component_id) : undefined;
    if (!side) {
      // Parts not under a side component are grouped by their own position.
      side = sides.find((candidate) => candidate.sideComponentId === null && candidate.position === row.position);
      if (!side) {
        side = { position: row.position, sideComponentId: null, label: sideLabel(row.position), parts: [] };
        sides.push(side);
      }
    }
    side.parts.push(part(row));
  }

  const sideOrder = (position: string | null) =>
    position === "left" ? 0 : position === "right" ? 1 : 2;
  sides.sort((a, b) => sideOrder(a.position) - sideOrder(b.position));
  return { assetHours: measurements.assetHours, sides };
}

/**
 * Set the wear limit for one measurement on an undercarriage component
 * (component managers only). Installed components are authorized through
 * their asset; a no-change save is a no-op.
 */
export async function setWearLimit(context: {
  supabase: SupabaseClient<DB>;
  admin: SupabaseClient<DB>;
  shopId: string;
  role: CanonicalRole;
  actorUserId: string;
  componentId: string;
  body: unknown;
}): Promise<WearLimit> {
  if (!canManageComponents(context.role)) {
    throw new EquipmentUndercarriageError("Your role cannot set wear limits.", 403);
  }
  const { data: component, error } = await context.admin
    .from("equipment_components")
    .select("id,component_type,installed_vehicle_id")
    .eq("shop_id", context.shopId)
    .eq("id", context.componentId)
    .maybeSingle();
  if (error) throw new EquipmentUndercarriageError("Unable to load component.", 500);
  if (!component) throw new EquipmentUndercarriageError("Component not found.", 404);
  if (!isUndercarriagePart(component.component_type)) {
    throw new EquipmentUndercarriageError("Wear limits apply to undercarriage components.", 400);
  }
  if (component.installed_vehicle_id) {
    const asset = await authorizeEquipmentAsset({ ...context, assetId: component.installed_vehicle_id });
    if (!asset) throw new EquipmentUndercarriageError("Component not found.", 404);
  }

  const validation = validateWearLimit(context.body, component.component_type);
  if (!validation.ok) throw new EquipmentUndercarriageError(validation.error, 400);
  const limit = validation.value;

  const { data: id, error: rpcError } = await context.admin.rpc("equipment_wear_limit_set", {
    p_shop_id: context.shopId,
    p_actor_user_id: context.actorUserId,
    p_component_id: context.componentId,
    p_measurement_type: limit.measurementType,
    p_new_value: limit.newValue,
    p_limit_value: limit.limitValue,
    p_unit: limit.unit,
    p_reference: limit.reference ?? undefined,
  });
  if (rpcError) {
    if (rpcError.code === "P0002") throw new EquipmentUndercarriageError("Component not found.", 404);
    if (rpcError.code === "22023" || rpcError.code === "23514") {
      throw new EquipmentUndercarriageError("The wear limit is invalid.", 400);
    }
    console.error("[equipment/undercarriage] wear limit failed", {
      code: rpcError.code ?? null,
      message: rpcError.message,
    });
    throw new EquipmentUndercarriageError("The wear limit could not be saved.", 500);
  }
  return {
    id: id as string,
    componentId: context.componentId,
    measurementType: limit.measurementType,
    unit: limit.unit,
    newValue: limit.newValue,
    limitValue: limit.limitValue,
    reference: limit.reference,
    setAt: new Date().toISOString(),
  };
}
