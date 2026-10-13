import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import { isAssetId } from "@/features/equipment/lib/assetProfile";
import { canManageComponents, canRecordComponentWork } from "@/features/equipment/lib/components";
import {
  pmCreateWorkOrderHref,
  pmWorkOrderState,
  type AssetPmWorkOrders,
  type PmWorkOrderLink,
} from "@/features/equipment/lib/pmWorkOrders";
import { authorizeEquipmentAsset } from "@/features/equipment/server/equipmentAssetProfileService";
import { EquipmentPmError } from "@/features/equipment/server/equipmentPmService";
import type { CanonicalRole } from "@/features/shared/lib/rbac";
import { createWorkOrderHandoffHref } from "@/features/vehicles/lib/vehicleWorkspace";
import {
  workOrderHref,
  workOrderTitle,
  type SearchWorkOrderRow,
} from "@/features/vehicles/server/searchShopVehicleRecords";
import { vehicleWorkspacePermissionsForRole } from "@/features/vehicles/server/vehicleWorkspacePermissions";
import { isEstimateRecord } from "@/features/work-orders/lib/work-order-status";

type DB = Database;
type LinkRow = Pick<
  DB["public"]["Tables"]["equipment_pm_work_orders"]["Row"],
  "id" | "plan_id" | "work_order_id" | "linked_at"
>;

const LINK_COLUMNS = "id,plan_id,work_order_id,linked_at";
const WORK_ORDER_COLUMNS =
  "id,custom_id,status,record_type,estimate_number,estimate_status,updated_at,odometer_km,vehicle_engine_hours";
const PAGE = 1_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type WorkOrderRow = {
  id: string;
  custom_id: string | null;
  status: string | null;
  record_type: string | null;
  estimate_number: string | null;
  estimate_status: string | null;
  updated_at: string | null;
  odometer_km: number | null;
  vehicle_engine_hours: number | null;
};

type WriteContext = {
  supabase: SupabaseClient<DB>;
  admin: SupabaseClient<DB>;
  shopId: string;
  role: CanonicalRole;
  actorUserId: string;
};

function requireOperationKey(body: unknown): string {
  const key = (body as { operationKey?: unknown } | null)?.operationKey;
  if (typeof key !== "string" || !UUID.test(key)) {
    throw new EquipmentPmError("An operation key is required.", 400);
  }
  return key;
}

function rpcFailure(
  scope: string,
  error: { code?: string | null; message: string },
  notFound: string,
  fallback: string,
): never {
  if (error.code === "P0002") throw new EquipmentPmError(notFound, 404);
  if (error.code === "22023" || error.code === "23514" || error.code === "23502") {
    const message = /operation key/i.test(error.message)
      ? "This request was already used for a different change. Reload and try again."
      : /archived/i.test(error.message)
        ? "This PM plan is archived."
        : /already unlinked/i.test(error.message)
          ? "This work order is already unlinked."
          : /work order/i.test(error.message)
            ? "Select one of this asset's work orders."
            : "The request is invalid.";
    throw new EquipmentPmError(message, 400);
  }
  console.error(`[equipment/pm-work-orders] ${scope} failed`, {
    code: error.code ?? null,
    message: error.message,
  });
  throw new EquipmentPmError(fallback, 500);
}

function mapLink(row: LinkRow, workOrder: WorkOrderRow | undefined): PmWorkOrderLink {
  // Work orders the caller cannot see are shown without a number, link or facts.
  if (!workOrder) {
    return {
      id: row.id,
      planId: row.plan_id,
      linkedAt: row.linked_at,
      workOrder: {
        id: row.work_order_id,
        label: "Work order",
        href: null,
        status: null,
        state: "unknown",
        odometerKm: null,
        engineHours: null,
        updatedOn: null,
      },
    };
  }
  const searchRow = workOrder as unknown as SearchWorkOrderRow;
  return {
    id: row.id,
    planId: row.plan_id,
    linkedAt: row.linked_at,
    workOrder: {
      id: workOrder.id,
      label: workOrderTitle(searchRow),
      href: workOrderHref(searchRow),
      status: workOrder.status,
      state: pmWorkOrderState(workOrder.status),
      odometerKm: workOrder.odometer_km,
      engineHours: workOrder.vehicle_engine_hours,
      updatedOn: workOrder.updated_at ? workOrder.updated_at.slice(0, 10) : null,
    },
  };
}

/**
 * Current (not unlinked) work-order links for an asset's PM plans, with each
 * work order's status and recorded meters, plus the create-work-order handoff.
 * The asset is authorized with the vehicle-workspace rules through the
 * caller's client first; work orders are read through the caller's client so
 * only ones the caller can see show details. Null when the asset is not
 * visible.
 */
export async function loadAssetPmWorkOrders(input: {
  supabase: SupabaseClient<DB>;
  admin: SupabaseClient<DB>;
  shopId: string;
  role: CanonicalRole;
  assetId: string;
}): Promise<AssetPmWorkOrders | null> {
  const asset = await authorizeEquipmentAsset(input);
  if (!asset) return null;

  const { data: linkData, error } = await input.admin
    .from("equipment_pm_work_orders")
    .select(LINK_COLUMNS)
    .eq("shop_id", input.shopId)
    .eq("vehicle_id", input.assetId)
    .is("unlinked_at", null)
    .order("linked_at", { ascending: false })
    .limit(PAGE);
  if (error) throw new EquipmentPmError("Unable to load PM work orders.", 500);
  const links = (linkData ?? []) as LinkRow[];

  const workOrders = new Map<string, WorkOrderRow>();
  const ids = [...new Set(links.map((link) => link.work_order_id))];
  if (ids.length) {
    const { data, error: workOrderError } = await input.supabase
      .from("work_orders")
      .select(WORK_ORDER_COLUMNS)
      .eq("shop_id", input.shopId)
      .eq("vehicle_id", input.assetId)
      .in("id", ids);
    if (workOrderError) throw new EquipmentPmError("Unable to load work orders.", 500);
    for (const row of (data ?? []) as WorkOrderRow[]) {
      if (!isEstimateRecord(row)) workOrders.set(row.id, row);
    }
  }

  const canCreate = vehicleWorkspacePermissionsForRole(input.role).canCreateWorkOrder;
  return {
    links: links.map((link) => mapLink(link, workOrders.get(link.work_order_id))),
    createWorkOrderHref: canCreate
      ? pmCreateWorkOrderHref({
          baseHref: createWorkOrderHandoffHref({ customerId: asset.customerId, vehicleId: asset.id }),
          assetId: asset.id,
        })
      : null,
    canLink: canRecordComponentWork(input.role),
    canUnlink: canManageComponents(input.role),
  };
}

/**
 * Link one of the asset's work orders to a PM plan (component work recorders;
 * mechanics only on assets they are assigned to). The work order must be a
 * work order for the plan's asset that the caller can see.
 */
export async function linkPmWorkOrder(
  context: WriteContext & { planId: string; body: unknown },
): Promise<{ id: string }> {
  if (!canRecordComponentWork(context.role)) {
    throw new EquipmentPmError("Your role cannot link PM work orders.", 403);
  }
  const operationKey = requireOperationKey(context.body);
  const workOrderId = (context.body as { workOrderId?: unknown } | null)?.workOrderId;
  if (!isAssetId(workOrderId)) {
    throw new EquipmentPmError("Select one of this asset's work orders.", 400);
  }

  const { data: plan, error } = await context.admin
    .from("equipment_pm_plans")
    .select("id,vehicle_id")
    .eq("shop_id", context.shopId)
    .eq("id", context.planId)
    .maybeSingle();
  if (error) throw new EquipmentPmError("Unable to load the PM plan.", 500);
  if (!plan) throw new EquipmentPmError("PM plan not found.", 404);
  const asset = await authorizeEquipmentAsset({ ...context, assetId: plan.vehicle_id });
  if (!asset) throw new EquipmentPmError("PM plan not found.", 404);

  const { data: workOrder, error: workOrderError } = await context.supabase
    .from("work_orders")
    .select("id,record_type,estimate_number")
    .eq("shop_id", context.shopId)
    .eq("vehicle_id", plan.vehicle_id)
    .eq("id", workOrderId)
    .maybeSingle();
  if (workOrderError) throw new EquipmentPmError("Unable to load the work order.", 500);
  if (!workOrder || isEstimateRecord(workOrder)) {
    throw new EquipmentPmError("Select one of this asset's work orders.", 400);
  }

  const { data, error: rpcError } = await context.admin.rpc("equipment_pm_work_order_link", {
    p_shop_id: context.shopId,
    p_actor_user_id: context.actorUserId,
    p_plan_id: context.planId,
    p_work_order_id: workOrderId,
    p_operation_key: operationKey,
  });
  if (rpcError) {
    rpcFailure("link", rpcError, "PM plan not found.", "The work order could not be linked.");
  }
  return { id: (data as { id: string }).id };
}

/** Unlink a mistakenly linked work order (component managers only; kept in history). */
export async function unlinkPmWorkOrder(
  context: WriteContext & { linkId: string; body: unknown },
): Promise<{ id: string }> {
  if (!canManageComponents(context.role)) {
    throw new EquipmentPmError("Your role cannot unlink PM work orders.", 403);
  }
  const operationKey = requireOperationKey(context.body);

  const { data: link, error } = await context.admin
    .from("equipment_pm_work_orders")
    .select("id,vehicle_id")
    .eq("shop_id", context.shopId)
    .eq("id", context.linkId)
    .maybeSingle();
  if (error) throw new EquipmentPmError("Unable to load the work order link.", 500);
  if (!link) throw new EquipmentPmError("Work order link not found.", 404);
  const asset = await authorizeEquipmentAsset({ ...context, assetId: link.vehicle_id });
  if (!asset) throw new EquipmentPmError("Work order link not found.", 404);

  const { data, error: rpcError } = await context.admin.rpc("equipment_pm_work_order_unlink", {
    p_shop_id: context.shopId,
    p_actor_user_id: context.actorUserId,
    p_link_id: context.linkId,
    p_operation_key: operationKey,
  });
  if (rpcError) {
    rpcFailure("unlink", rpcError, "Work order link not found.", "The work order could not be unlinked.");
  }
  return { id: (data as { id: string }).id };
}
