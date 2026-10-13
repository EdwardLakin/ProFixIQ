import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import { canManageComponents, canRecordComponentWork } from "@/features/equipment/lib/components";
import {
  evaluatePmPlan,
  parseOdometer,
  todayIso,
  validatePmCompletion,
  validatePmPlan,
  validateVoidReason,
  worstPmState,
  type AssetPm,
  type PmCompletion,
  type PmDistanceUnit,
  type PmMeters,
  type PmPlan,
} from "@/features/equipment/lib/pm";
import { authorizeEquipmentAsset } from "@/features/equipment/server/equipmentAssetProfileService";
import type { CanonicalRole } from "@/features/shared/lib/rbac";
import {
  workOrderHref,
  workOrderTitle,
  type SearchWorkOrderRow,
} from "@/features/vehicles/server/searchShopVehicleRecords";
import { isEstimateRecord } from "@/features/work-orders/lib/work-order-status";

type DB = Database;
type PlanRow = DB["public"]["Tables"]["equipment_pm_plans"]["Row"];
type CompletionRow = DB["public"]["Tables"]["equipment_pm_completions"]["Row"];

const PLAN_COLUMNS =
  "id,shop_id,vehicle_id,name,instructions,interval_hours,interval_distance,distance_unit,interval_cycles,interval_days,start_date,start_hours,start_distance,start_cycles,active,version,created_by,created_at,updated_by,updated_at";
const COMPLETION_COLUMNS =
  "id,shop_id,sequence,plan_id,vehicle_id,completed_on,asset_hours,distance,distance_unit,cycles,work_order_id,notes,recorded_by,created_at,voided_at,voided_by,void_reason";
const WORK_ORDER_COLUMNS = "id,custom_id,status,record_type,estimate_number,estimate_status,created_at";
const PAGE = 1_000;

export class EquipmentPmError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 500,
  ) {
    super(message);
  }
}

function asUnit(value: string | null): PmDistanceUnit | null {
  return value === "km" || value === "mi" ? value : null;
}

function numberOrNull(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapPlan(row: PlanRow): PmPlan {
  return {
    id: row.id,
    assetId: row.vehicle_id,
    name: row.name,
    instructions: row.instructions,
    intervalHours: row.interval_hours,
    intervalDistance: numberOrNull(row.interval_distance),
    distanceUnit: asUnit(row.distance_unit),
    intervalCycles: row.interval_cycles,
    intervalDays: row.interval_days,
    startDate: row.start_date,
    startHours: row.start_hours,
    startDistance: numberOrNull(row.start_distance),
    startCycles: row.start_cycles,
    active: row.active,
    version: row.version,
    updatedAt: row.updated_at,
  };
}

type WorkOrderRef = { id: string; label: string; href: string };

function mapCompletion(row: CompletionRow, workOrders: Map<string, WorkOrderRef>): PmCompletion {
  const workOrder = row.work_order_id ? workOrders.get(row.work_order_id) : undefined;
  return {
    id: row.id,
    planId: row.plan_id,
    completedOn: row.completed_on,
    assetHours: row.asset_hours,
    distance: numberOrNull(row.distance),
    distanceUnit: asUnit(row.distance_unit),
    cycles: row.cycles,
    // Work orders the caller cannot see are shown without a link or number.
    workOrder: row.work_order_id
      ? workOrder
        ? { id: workOrder.id, label: workOrder.label, href: workOrder.href }
        : { id: row.work_order_id, label: "Work order", href: null }
      : null,
    notes: row.notes,
    recordedBy: row.recorded_by,
    createdAt: row.created_at,
    voided: row.voided_at ? { at: row.voided_at, reason: row.void_reason ?? "" } : null,
  };
}

function workOrderRef(row: Pick<SearchWorkOrderRow, "id" | "custom_id" | "status" | "record_type" | "estimate_number" | "estimate_status">): WorkOrderRef {
  const searchRow = row as SearchWorkOrderRow;
  return { id: row.id, label: workOrderTitle(searchRow), href: workOrderHref(searchRow) };
}

async function readCompletions(
  admin: SupabaseClient<DB>,
  shopId: string,
  assetId: string,
): Promise<CompletionRow[]> {
  const rows: CompletionRow[] = [];
  for (let page = 0; ; page += 1) {
    const { data, error } = await admin
      .from("equipment_pm_completions")
      .select(COMPLETION_COLUMNS)
      .eq("shop_id", shopId)
      .eq("vehicle_id", assetId)
      .order("completed_on", { ascending: false })
      .order("sequence", { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new EquipmentPmError("Unable to load PM completions.", 500);
    rows.push(...((data ?? []) as CompletionRow[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

/**
 * PM plans for an asset with their due status. The asset is authorized with
 * the vehicle-workspace rules (shop scope, mechanic assignment) through the
 * caller's RLS client before any privileged read. Returns null when the asset
 * is not visible.
 */
export async function loadAssetPm(input: {
  supabase: SupabaseClient<DB>;
  admin: SupabaseClient<DB>;
  shopId: string;
  role: CanonicalRole;
  assetId: string;
  now?: number;
}): Promise<AssetPm | null> {
  const asset = await authorizeEquipmentAsset(input);
  if (!asset) return null;

  const [profileResult, plansResult, completionRows, workOrdersResult] = await Promise.all([
    input.admin
      .from("equipment_asset_profiles")
      .select("current_cycles,meters_updated_at")
      .eq("shop_id", input.shopId)
      .eq("vehicle_id", input.assetId)
      .maybeSingle(),
    input.admin
      .from("equipment_pm_plans")
      .select(PLAN_COLUMNS)
      .eq("shop_id", input.shopId)
      .eq("vehicle_id", input.assetId)
      .order("active", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(PAGE),
    readCompletions(input.admin, input.shopId, input.assetId),
    // Through the caller's client: only work orders the caller can see.
    input.supabase
      .from("work_orders")
      .select(WORK_ORDER_COLUMNS)
      .eq("shop_id", input.shopId)
      .eq("vehicle_id", input.assetId)
      .order("created_at", { ascending: false })
      .limit(PAGE),
  ]);
  if (profileResult.error) throw new EquipmentPmError("Unable to load the asset profile.", 500);
  if (plansResult.error) throw new EquipmentPmError("Unable to load PM plans.", 500);
  if (workOrdersResult.error) throw new EquipmentPmError("Unable to load work orders.", 500);

  const visibleWorkOrders = (workOrdersResult.data ?? []).filter((row) => !isEstimateRecord(row));
  const workOrderRefs = new Map(visibleWorkOrders.map((row) => [row.id, workOrderRef(row)]));

  const meters: PmMeters = {
    hours: asset.engineHours,
    distance: parseOdometer(asset.odometer, asset.odometerUnit),
    cycles: profileResult.data?.current_cycles ?? null,
    updatedAt: profileResult.data?.meters_updated_at ?? null,
    today: todayIso(input.now),
  };

  const completionsByPlan = new Map<string, PmCompletion[]>();
  for (const row of completionRows) {
    const list = completionsByPlan.get(row.plan_id) ?? [];
    list.push(mapCompletion(row, workOrderRefs));
    completionsByPlan.set(row.plan_id, list);
  }

  const plans = ((plansResult.data ?? []) as PlanRow[]).map((row) =>
    evaluatePmPlan(mapPlan(row), completionsByPlan.get(row.id) ?? [], meters),
  );

  return {
    meters,
    plans,
    state: worstPmState(plans.filter((entry) => entry.plan.active).map((entry) => entry.state)),
    workOrders: visibleWorkOrders.slice(0, 20).map((row) => ({
      id: row.id,
      label: workOrderRefs.get(row.id)!.label,
      status: row.status ?? "",
      createdAt: row.created_at ?? "",
    })),
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
  if (error.code === "P0002") throw new EquipmentPmError(messages.notFound, 404);
  if (error.code === "40001") {
    throw new EquipmentPmError("The PM plan was changed by someone else. Reload and try again.", 409);
  }
  if (error.code === "22023" || error.code === "23514" || error.code === "23502") {
    const message = /operation key/i.test(error.message)
      ? "This request was already used for a different change. Reload and try again."
      : /archived/i.test(error.message)
        ? "This PM plan is archived."
        : /already voided/i.test(error.message)
          ? "This completion is already voided."
          : "The PM request is invalid.";
    throw new EquipmentPmError(message, 400);
  }
  console.error(`[equipment/pm] ${scope} failed`, { code: error.code ?? null, message: error.message });
  throw new EquipmentPmError(messages.fallback, 500);
}

function requireOperationKey(body: unknown): string {
  const key = (body as { operationKey?: unknown } | null)?.operationKey;
  if (typeof key !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) {
    throw new EquipmentPmError("An operation key is required.", 400);
  }
  return key;
}

/**
 * Create a PM plan on an asset (planId null, assetId required) or update a
 * plan (its asset comes from the plan). Component managers only; an update
 * requires the version the editor loaded.
 */
export async function savePmPlan(
  context: WriteContext & { assetId: string | null; planId: string | null; body: unknown; now?: number },
): Promise<{ id: string; version: number }> {
  if (!canManageComponents(context.role)) {
    throw new EquipmentPmError("Your role cannot manage PM plans.", 403);
  }
  const operationKey = requireOperationKey(context.body);
  const validation = validatePmPlan(context.body, context.now);
  if (!validation.ok) throw new EquipmentPmError(validation.error, 400);
  let expectedVersion: number | null = null;
  if (context.planId) {
    const raw = (context.body as { expectedVersion?: unknown }).expectedVersion;
    if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) {
      throw new EquipmentPmError("Reload the plan and try again.", 400);
    }
    expectedVersion = raw;
  }

  let assetId = context.assetId;
  if (context.planId) {
    const { data: existing, error } = await context.admin
      .from("equipment_pm_plans")
      .select("id,vehicle_id")
      .eq("shop_id", context.shopId)
      .eq("id", context.planId)
      .maybeSingle();
    if (error) throw new EquipmentPmError("Unable to load the PM plan.", 500);
    if (!existing) throw new EquipmentPmError("PM plan not found.", 404);
    assetId = existing.vehicle_id;
  }
  if (!assetId) throw new EquipmentPmError("Asset not found.", 404);
  const asset = await authorizeEquipmentAsset({ ...context, assetId });
  if (!asset) {
    throw new EquipmentPmError(context.planId ? "PM plan not found." : "Asset not found.", 404);
  }

  const plan = validation.value;
  const { data, error } = await context.admin.rpc("equipment_pm_plan_save", {
    p_shop_id: context.shopId,
    p_actor_user_id: context.actorUserId,
    p_vehicle_id: assetId,
    // A null plan id creates a plan.
    p_plan_id: context.planId as string,
    p_expected_version: expectedVersion as number,
    p_plan: {
      name: plan.name,
      instructions: plan.instructions,
      interval_hours: plan.intervalHours,
      interval_distance: plan.intervalDistance,
      distance_unit: plan.distanceUnit,
      interval_cycles: plan.intervalCycles,
      interval_days: plan.intervalDays,
      start_date: plan.startDate,
      start_hours: plan.startHours,
      start_distance: plan.startDistance,
      start_cycles: plan.startCycles,
      active: plan.active,
    },
    p_operation_key: operationKey,
  });
  if (error) {
    rpcFailure("save plan", error, {
      notFound: context.planId ? "PM plan not found." : "Asset not found.",
      fallback: "The PM plan could not be saved.",
    });
  }
  const result = data as { id: string; version: number };
  return { id: result.id, version: result.version };
}

/**
 * Record a PM completion with the meters at the time. Component work
 * recorders (mechanics only on assets they are assigned to). A linked work
 * order must be one of the asset's work orders the caller can see.
 */
export async function recordPmCompletion(
  context: WriteContext & { planId: string; body: unknown; now?: number },
): Promise<{ id: string }> {
  if (!canRecordComponentWork(context.role)) {
    throw new EquipmentPmError("Your role cannot record PM completions.", 403);
  }
  const operationKey = requireOperationKey(context.body);
  const { data: planRow, error } = await context.admin
    .from("equipment_pm_plans")
    .select(PLAN_COLUMNS)
    .eq("shop_id", context.shopId)
    .eq("id", context.planId)
    .maybeSingle();
  if (error) throw new EquipmentPmError("Unable to load the PM plan.", 500);
  if (!planRow) throw new EquipmentPmError("PM plan not found.", 404);
  const asset = await authorizeEquipmentAsset({ ...context, assetId: planRow.vehicle_id });
  if (!asset) throw new EquipmentPmError("PM plan not found.", 404);

  // An archived plan is refused by the RPC (after an idempotent replay check).
  const plan = mapPlan(planRow as PlanRow);
  const validation = validatePmCompletion(context.body, plan, context.now);
  if (!validation.ok) throw new EquipmentPmError(validation.error, 400);
  const completion = validation.value;

  if (completion.workOrderId) {
    const { data: workOrder, error: workOrderError } = await context.supabase
      .from("work_orders")
      .select("id,record_type,estimate_number")
      .eq("shop_id", context.shopId)
      .eq("vehicle_id", planRow.vehicle_id)
      .eq("id", completion.workOrderId)
      .maybeSingle();
    if (workOrderError) throw new EquipmentPmError("Unable to load the work order.", 500);
    // Estimates are not work done; only the asset's work orders can be linked.
    if (!workOrder || isEstimateRecord(workOrder)) {
      throw new EquipmentPmError("Select one of this asset's work orders.", 400);
    }
  }

  const { data, error: rpcError } = await context.admin.rpc("equipment_pm_complete", {
    p_shop_id: context.shopId,
    p_actor_user_id: context.actorUserId,
    p_plan_id: context.planId,
    p_completion: {
      completed_on: completion.completedOn,
      asset_hours: completion.assetHours,
      distance: completion.distance,
      distance_unit: completion.distanceUnit,
      cycles: completion.cycles,
      work_order_id: completion.workOrderId,
      notes: completion.notes,
    },
    p_operation_key: operationKey,
  });
  if (rpcError) {
    rpcFailure("complete", rpcError, {
      notFound: "PM plan not found.",
      fallback: "The completion could not be recorded.",
    });
  }
  return { id: (data as { id: string }).id };
}

/** Void a mistaken completion with a reason (component managers only). */
export async function voidPmCompletion(
  context: WriteContext & { completionId: string; body: unknown },
): Promise<{ id: string }> {
  if (!canManageComponents(context.role)) {
    throw new EquipmentPmError("Your role cannot void PM completions.", 403);
  }
  const operationKey = requireOperationKey(context.body);
  const reason = validateVoidReason((context.body as { reason?: unknown }).reason);
  if (!reason.ok) throw new EquipmentPmError(reason.error, 400);

  const { data: row, error } = await context.admin
    .from("equipment_pm_completions")
    .select("id,vehicle_id")
    .eq("shop_id", context.shopId)
    .eq("id", context.completionId)
    .maybeSingle();
  if (error) throw new EquipmentPmError("Unable to load the completion.", 500);
  if (!row) throw new EquipmentPmError("Completion not found.", 404);
  const asset = await authorizeEquipmentAsset({ ...context, assetId: row.vehicle_id });
  if (!asset) throw new EquipmentPmError("Completion not found.", 404);

  const { data, error: rpcError } = await context.admin.rpc("equipment_pm_completion_void", {
    p_shop_id: context.shopId,
    p_actor_user_id: context.actorUserId,
    p_completion_id: context.completionId,
    p_reason: reason.value,
    p_operation_key: operationKey,
  });
  if (rpcError) {
    rpcFailure("void", rpcError, {
      notFound: "Completion not found.",
      fallback: "The completion could not be voided.",
    });
  }
  return { id: (data as { id: string }).id };
}
