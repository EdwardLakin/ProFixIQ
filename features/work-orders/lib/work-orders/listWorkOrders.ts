import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import type { WorkOrderBoardRow, WorkOrderBoardVariant } from "@/features/shared/lib/workboard/types";
import { normalizeWorkOrderStatus } from "@/features/work-orders/lib/work-order-status";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Line = DB["public"]["Tables"]["work_order_lines"]["Row"];

type WorkOrderListClient = Pick<SupabaseClient<DB>, "from">;

type CustomerSummary = Pick<Customer, "first_name" | "last_name" | "phone" | "email">;
type VehicleSummary = Pick<Vehicle, "year" | "make" | "model" | "license_plate">;

export type WorkOrdersListRow = WorkOrder & {
  is_waiter?: boolean | null;
  customers: CustomerSummary | null;
  vehicles: VehicleSummary | null;
};

export type WorkOrdersListResult = {
  rows: WorkOrdersListRow[];
  techRollupByWo: Record<string, "awaiting" | "in_progress" | "on_hold" | "completed">;
  assignedByWo: Record<string, boolean>;
  hasLinesByWo: Record<string, boolean>;
};

export type WorkOrdersListParams = {
  shopId: string;
  status?: string | null;
  search?: string | null;
  seededShop?: boolean;
  workforceDrilldownActive?: boolean;
  limit?: number;
};

export const WORK_ORDER_ACTIVE_FLOW_STATUSES = [
  "new",
  "awaiting",
  "awaiting_inspection",
  "recommended",
  "awaiting_approval",
  "waiting_parts",
  "approved",
  "in_progress",
  "on_hold",
  "ready_to_invoice",
  "queued",
  "planned",
] as const;

const SEEDED_DEFAULT_STATUSES = [...WORK_ORDER_ACTIVE_FLOW_STATUSES, "completed"] as const;
const ACTIVE_LINE_EXCLUDED = new Set(["completed", "invoiced", "closed", "cancelled", "declined"]);
const PAGE_SIZE = 1000;

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function normalizeStatusKey(value: unknown): string {
  return String(value ?? "new").trim().toLowerCase().replaceAll(" ", "_");
}

function rollupTechStatus(lines: Array<Pick<Line, "status">>): "awaiting" | "in_progress" | "on_hold" | "completed" {
  const statuses = new Set(lines.map((line) => String(line.status ?? "awaiting").toLowerCase()));
  if (statuses.has("in_progress")) return "in_progress";
  if (statuses.has("on_hold")) return "on_hold";
  if (lines.length > 0 && lines.every((line) => String(line.status ?? "") === "completed")) return "completed";
  return "awaiting";
}

function customerSearchText(customer: CustomerSummary | null): string {
  return [customer?.first_name ?? "", customer?.last_name ?? ""].filter(Boolean).join(" ").toLowerCase();
}

function vehicleSearchText(vehicle: VehicleSummary | null): { plate: string; ymm: string } {
  return {
    plate: vehicle?.license_plate?.toLowerCase() ?? "",
    ymm: [vehicle?.year ?? "", vehicle?.make ?? "", vehicle?.model ?? ""].join(" ").toLowerCase(),
  };
}

async function fetchSameShopCustomers(
  supabase: WorkOrderListClient,
  shopId: string,
  customerIds: string[],
): Promise<Map<string, CustomerSummary>> {
  const byId = new Map<string, CustomerSummary>();
  for (let index = 0; index < customerIds.length; index += PAGE_SIZE) {
    const ids = customerIds.slice(index, index + PAGE_SIZE);
    const { data, error } = await supabase
      .from("customers")
      .select("id, first_name, last_name, phone, email, shop_id")
      .eq("shop_id", shopId)
      .in("id", ids);
    if (error) {
      console.warn("[work-orders] same-shop customer lookup failed", {
        shopId,
        customerIdCount: ids.length,
        code: "code" in error ? error.code : undefined,
        message: error.message,
        table: "customers",
      });
      continue;
    }
    for (const row of (data ?? []) as Array<CustomerSummary & { id: string; shop_id?: string | null }>) {
      byId.set(row.id, {
        first_name: row.first_name,
        last_name: row.last_name,
        phone: row.phone,
        email: row.email,
      });
    }
  }
  return byId;
}

async function fetchSameShopVehicles(
  supabase: WorkOrderListClient,
  shopId: string,
  vehicleIds: string[],
): Promise<Map<string, VehicleSummary>> {
  const byId = new Map<string, VehicleSummary>();
  for (let index = 0; index < vehicleIds.length; index += PAGE_SIZE) {
    const ids = vehicleIds.slice(index, index + PAGE_SIZE);
    const { data, error } = await supabase
      .from("vehicles")
      .select("id, year, make, model, license_plate, shop_id")
      .eq("shop_id", shopId)
      .in("id", ids);
    if (error) {
      console.warn("[work-orders] same-shop vehicle lookup failed", {
        shopId,
        vehicleIdCount: ids.length,
        code: "code" in error ? error.code : undefined,
        message: error.message,
        table: "vehicles",
      });
      continue;
    }
    for (const row of (data ?? []) as Array<VehicleSummary & { id: string; shop_id?: string | null }>) {
      byId.set(row.id, {
        year: row.year,
        make: row.make,
        model: row.model,
        license_plate: row.license_plate,
      });
    }
  }
  return byId;
}

async function fetchUnassignedActiveWorkOrderIds(supabase: WorkOrderListClient, shopId: string): Promise<string[] | null> {
  const { data: activeLines, error } = await supabase
    .from("work_order_lines")
    .select("id, work_order_id, assigned_tech_id, line_status, status, voided_at, shop_id")
    .eq("shop_id", shopId)
    .is("voided_at", null);

  if (error) throw new Error(error.message);

  const scopedActiveLines = ((activeLines ?? []) as Array<Pick<Line, "id" | "work_order_id" | "assigned_tech_id" | "status"> & { line_status?: string | null }>).filter(
    (line) => !ACTIVE_LINE_EXCLUDED.has(String(line.line_status ?? line.status ?? "").toLowerCase()),
  );
  const lineIds = uniqueNonEmpty(scopedActiveLines.map((line) => line.id));
  const { data: bridgeRows, error: bridgeError } = lineIds.length
    ? await supabase.from("work_order_line_technicians").select("work_order_line_id").in("work_order_line_id", lineIds)
    : { data: [], error: null };
  if (bridgeError) throw new Error(bridgeError.message);

  const hasBridgeAssignment = new Set((bridgeRows ?? []).map((row) => row.work_order_line_id));
  return uniqueNonEmpty(
    scopedActiveLines
      .filter((line) => !line.assigned_tech_id && !hasBridgeAssignment.has(line.id))
      .map((line) => line.work_order_id),
  );
}

async function buildLineRollups(supabase: WorkOrderListClient, shopId: string, workOrderIds: string[]) {
  const techRollupByWo: WorkOrdersListResult["techRollupByWo"] = {};
  const assignedByWo: WorkOrdersListResult["assignedByWo"] = {};
  const hasLinesByWo: WorkOrdersListResult["hasLinesByWo"] = {};

  if (workOrderIds.length === 0) return { techRollupByWo, assignedByWo, hasLinesByWo };

  const { data: lines, error } = await supabase
    .from("work_order_lines")
    .select("id, work_order_id, status, assigned_tech_id, shop_id")
    .eq("shop_id", shopId)
    .in("work_order_id", workOrderIds);
  if (error) throw new Error(error.message);

  const lineRows = (lines ?? []) as Array<Pick<Line, "id" | "work_order_id" | "status" | "assigned_tech_id">>;
  const lineIds = uniqueNonEmpty(lineRows.map((line) => line.id));
  const { data: bridgeAssignments } = lineIds.length
    ? await supabase.from("work_order_line_technicians").select("work_order_line_id").in("work_order_line_id", lineIds)
    : { data: [] };
  const bridgeAssignedLineIds = new Set((bridgeAssignments ?? []).map((row) => row.work_order_line_id).filter(Boolean));
  const byWo: Record<string, Array<Pick<Line, "status">>> = {};

  for (const line of lineRows) {
    const woId = line.work_order_id;
    if (!woId) continue;
    hasLinesByWo[woId] = true;
    if (!byWo[woId]) byWo[woId] = [];
    byWo[woId].push(line);
    if (line.assigned_tech_id || bridgeAssignedLineIds.has(line.id)) assignedByWo[woId] = true;
  }

  for (const woId of workOrderIds) {
    techRollupByWo[woId] = rollupTechStatus(byWo[woId] ?? []);
    assignedByWo[woId] = Boolean(assignedByWo[woId]);
    hasLinesByWo[woId] = Boolean(hasLinesByWo[woId]);
  }

  return { techRollupByWo, assignedByWo, hasLinesByWo };
}

export async function listWorkOrdersForActorShop(
  supabase: WorkOrderListClient,
  params: WorkOrdersListParams,
): Promise<WorkOrdersListResult> {
  const status = params.status?.trim() ?? "";
  const limit = Math.max(1, Math.min(params.limit ?? 100, 250));
  const selectedStatuses = status ? [normalizeWorkOrderStatus(normalizeStatusKey(status))] : [...(params.seededShop ? SEEDED_DEFAULT_STATUSES : WORK_ORDER_ACTIVE_FLOW_STATUSES)];

  let unassignedWorkOrderIds: string[] | null = null;
  if (params.workforceDrilldownActive) {
    unassignedWorkOrderIds = await fetchUnassignedActiveWorkOrderIds(supabase, params.shopId);
    if (unassignedWorkOrderIds?.length === 0) return { rows: [], techRollupByWo: {}, assignedByWo: {}, hasLinesByWo: {} };
  }

  let query = supabase
    .from("work_orders")
    .select("*")
    .eq("shop_id", params.shopId)
    .in("status", selectedStatuses)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (unassignedWorkOrderIds) query = query.in("id", unassignedWorkOrderIds);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const workOrders = (data ?? []) as WorkOrder[];
  const customerIds = uniqueNonEmpty(workOrders.map((row) => row.customer_id));
  const vehicleIds = uniqueNonEmpty(workOrders.map((row) => row.vehicle_id));
  const [customersById, vehiclesById] = await Promise.all([
    fetchSameShopCustomers(supabase, params.shopId, customerIds),
    fetchSameShopVehicles(supabase, params.shopId, vehicleIds),
  ]);

  const rows = workOrders.map((row) => ({
    ...row,
    customers: row.customer_id ? customersById.get(row.customer_id) ?? null : null,
    vehicles: row.vehicle_id ? vehiclesById.get(row.vehicle_id) ?? null : null,
  })) as WorkOrdersListRow[];

  const qlc = params.search?.trim().toLowerCase() ?? "";
  const filtered = qlc
    ? rows.filter((row) => {
        const vehicle = vehicleSearchText(row.vehicles);
        const cid = String(row.custom_id ?? "").toLowerCase();
        return (
          row.id.toLowerCase().includes(qlc) ||
          cid.includes(qlc) ||
          customerSearchText(row.customers).includes(qlc) ||
          vehicle.plate.includes(qlc) ||
          vehicle.ymm.includes(qlc)
        );
      })
    : rows;

  const rollups = await buildLineRollups(supabase, params.shopId, filtered.map((row) => row.id));
  return { rows: filtered, ...rollups };
}

function boardViewForVariant(variant: WorkOrderBoardVariant) {
  if (variant === "fleet") return "v_work_order_board_cards_fleet";
  if (variant === "portal") return "v_work_order_board_cards_portal";
  return "v_work_order_board_cards_shop";
}

export async function listWorkOrderBoardRowsForActorShop(
  supabase: WorkOrderListClient,
  params: { shopId: string; variant: WorkOrderBoardVariant; fleetId?: string | null; limit?: number },
): Promise<WorkOrderBoardRow[]> {
  let query = supabase
    .from(boardViewForVariant(params.variant))
    .select("*")
    .eq("shop_id", params.shopId)
    .order("activity_at", { ascending: false });

  if (params.variant === "fleet" && params.fleetId) query = query.eq("fleet_id", params.fleetId);
  if (params.limit) query = query.limit(Math.max(1, Math.min(params.limit, 100)));

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as WorkOrderBoardRow[];
}
