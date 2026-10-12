import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@shared/types/types/supabase";
import type { EquipmentPmState } from "@/features/equipment/lib/equipmentDirectory";
import type { MaintenanceSuggestionItem } from "@/features/maintenance/server/types";
import {
  extractInspectionFindings,
  latestCanonicalServiceWorkOrder,
  latestWorkOrderOdometer,
  maintenanceCacheIsFresh,
  maintenanceItems,
  type MaintenanceSuggestionRow,
  type WorkspaceWorkOrderLineRow,
  type WorkspaceWorkOrderRow,
} from "@/features/vehicles/server/loadVehicleWorkspaceSnapshot";
import {
  normalizedState,
  TERMINAL_APPOINTMENT_STATUSES,
  type SearchWorkOrderRow,
} from "@/features/vehicles/server/searchShopVehicleRecords";
import { isEstimateRecord } from "@/features/work-orders/lib/work-order-status";

type DB = Database;
export type EvidenceWorkOrderRow = SearchWorkOrderRow &
  WorkspaceWorkOrderRow & { picked_up_at: string | null };

/** PostgREST caps each response at 1,000 rows (supabase/config.toml max_rows). */
const PAGE_SIZE = 1_000;
/** Asset ids per `in` filter, keeping URLs bounded like the workspace loaders. */
const ID_CHUNK = 100;
const MAX_PAGES = 50;

const WORK_ORDER_COLUMNS =
  "id,custom_id,status,record_type,approval_state,estimate_number,estimate_status,customer_id,customer_name,vehicle_id,vehicle_year,vehicle_make,vehicle_model,vehicle_submodel,vehicle_vin,vehicle_license_plate,vehicle_unit_number,vehicle_mileage,odometer_km,scheduled_at,picked_up_at,created_at,updated_at";
const LINE_COLUMNS =
  "id,work_order_id,description,complaint,correction,hold_reason,status,line_status,approval_state,urgency,voided_at,created_at,updated_at";

/** Work orders whose status means the service was carried out. */
const SERVICED_STATES = new Set([
  "completed",
  "ready_to_invoice",
  "invoiced",
  "paid",
  "closed",
]);

export class EquipmentEvidenceError extends Error {}

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

/**
 * Load every row for a set of ids: ids are chunked so `in` filters stay
 * bounded, and each chunk is paged with `range` so the API row cap can never
 * silently truncate evidence.
 */
async function loadAllForIds<T>(
  what: string,
  ids: string[],
  query: (chunk: string[], from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; offset < ids.length; offset += ID_CHUNK) {
    const chunk = ids.slice(offset, offset + ID_CHUNK);
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const from = page * PAGE_SIZE;
      const { data, error } = await query(chunk, from, from + PAGE_SIZE - 1);
      if (error) throw new EquipmentEvidenceError(`Unable to load ${what}.`);
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE_SIZE) break;
      if (page === MAX_PAGES - 1) {
        throw new EquipmentEvidenceError(`Too many ${what} to load completely.`);
      }
    }
  }
  return rows;
}

function time(value: string | null | undefined): number {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

export type EquipmentInspectionEvidence = {
  inspectionId: string;
  workOrderId: string | null;
  recordedAt: string | null;
  findings: ReturnType<typeof extractInspectionFindings>;
};

export type EquipmentPmEvidence = {
  state: EquipmentPmState;
  items: MaintenanceSuggestionItem[];
  workOrderId: string | null;
};

export type EquipmentAssetEvidence = {
  workOrders: EvidenceWorkOrderRow[];
  /** Findings on the latest completed canonical inspection — the asset's current recorded condition. */
  latestInspection: EquipmentInspectionEvidence | null;
  pm: EquipmentPmEvidence;
  lastServiceAt: string | null;
  nextBooking: { startsAt: string; status: string } | null;
  /** Newest dated work-order odometer reading (km), as the vehicle workspace uses. */
  workOrderOdometerKm: number | null;
};

type InspectionRow = {
  id: string;
  vehicle_id: string | null;
  work_order_id: string | null;
  status: string;
  completed: boolean | null;
  is_canonical: boolean;
  finalized_at: string | null;
  updated_at: string | null;
  created_at: string | null;
  summary: Json | null;
};

/**
 * Batched Equipment evidence for a set of assets, derived with the canonical
 * vehicle-workspace helpers through the caller's RLS client. The directory
 * and Asset Health both read from here, so they never disagree.
 */
export async function loadEquipmentEvidence(input: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  assetIds: string[];
  now?: Date;
}): Promise<Map<string, EquipmentAssetEvidence>> {
  const { supabase, shopId } = input;
  const assetIds = Array.from(new Set(input.assetIds));
  const nowIso = (input.now ?? new Date()).toISOString();
  const result = new Map<string, EquipmentAssetEvidence>();
  if (!assetIds.length) return result;

  const [workOrders, inspections, bookings] = await Promise.all([
    loadAllForIds<EvidenceWorkOrderRow>("work orders", assetIds, (chunk, from, to) =>
      supabase
        .from("work_orders")
        .select(WORK_ORDER_COLUMNS)
        .eq("shop_id", shopId)
        .in("vehicle_id", chunk)
        .order("id", { ascending: true })
        .range(from, to) as unknown as PromiseLike<PageResult<EvidenceWorkOrderRow>>,
    ),
    loadAllForIds<InspectionRow>("inspections", assetIds, (chunk, from, to) =>
      supabase
        .from("inspections")
        .select(
          "id,vehicle_id,work_order_id,status,completed,is_canonical,finalized_at,updated_at,created_at,summary",
        )
        .eq("shop_id", shopId)
        .eq("is_canonical", true)
        .in("vehicle_id", chunk)
        .order("id", { ascending: true })
        .range(from, to) as unknown as PromiseLike<PageResult<InspectionRow>>,
    ),
    loadAllForIds<{ vehicle_id: string | null; status: string; starts_at: string }>(
      "appointments",
      assetIds,
      (chunk, from, to) =>
        supabase
          .from("bookings")
          .select("vehicle_id,status,starts_at")
          .eq("shop_id", shopId)
          .in("vehicle_id", chunk)
          .gte("ends_at", nowIso)
          .order("starts_at", { ascending: true })
          .range(from, to) as unknown as PromiseLike<
          PageResult<{ vehicle_id: string | null; status: string; starts_at: string }>
        >,
    ),
  ]);

  const workOrdersByAsset = new Map<string, EvidenceWorkOrderRow[]>();
  for (const row of workOrders) {
    if (!row.vehicle_id) continue;
    const list = workOrdersByAsset.get(row.vehicle_id) ?? [];
    list.push(row);
    workOrdersByAsset.set(row.vehicle_id, list);
  }

  // PM evidence: the ready suggestion for the latest canonical service work
  // order, accepted only while fresh — exactly as the vehicle workspace does.
  const serviceWorkOrderByAsset = new Map<string, EvidenceWorkOrderRow>();
  for (const [assetId, rows] of workOrdersByAsset) {
    const latest = latestCanonicalServiceWorkOrder(rows);
    if (latest) serviceWorkOrderByAsset.set(assetId, latest as EvidenceWorkOrderRow);
  }
  const serviceWorkOrderIds = Array.from(serviceWorkOrderByAsset.values()).map((row) => row.id);
  const [suggestions, lines] = await Promise.all([
    loadAllForIds<MaintenanceSuggestionRow>(
      "maintenance status",
      serviceWorkOrderIds,
      (chunk, from, to) =>
        supabase
          .from("maintenance_suggestions")
          .select(
            "work_order_id,vehicle_id,status,suggestions,created_at,updated_at,error_message,mileage_km",
          )
          .in("work_order_id", chunk)
          .eq("status", "ready")
          .order("work_order_id", { ascending: true })
          .range(from, to) as unknown as PromiseLike<PageResult<MaintenanceSuggestionRow>>,
    ),
    loadAllForIds<WorkspaceWorkOrderLineRow>(
      "work order lines",
      serviceWorkOrderIds,
      (chunk, from, to) =>
        supabase
          .from("work_order_lines")
          .select(LINE_COLUMNS)
          .eq("shop_id", shopId)
          .in("work_order_id", chunk)
          .order("id", { ascending: true })
          .range(from, to) as unknown as PromiseLike<PageResult<WorkspaceWorkOrderLineRow>>,
    ),
  ]);
  const suggestionByWorkOrder = new Map(suggestions.map((row) => [row.work_order_id, row]));

  // Current recorded condition: the latest completed canonical inspection.
  // Drafts, in-progress and superseded (non-canonical) inspections are excluded.
  const latestInspectionByAsset = new Map<string, InspectionRow>();
  for (const row of inspections) {
    if (!row.vehicle_id) continue;
    const completed = row.completed === true || Boolean(row.finalized_at) ||
      ["completed", "finalized", "signed"].includes(normalizedState(row.status));
    if (!completed) continue;
    const at = time(row.finalized_at ?? row.updated_at ?? row.created_at);
    const current = latestInspectionByAsset.get(row.vehicle_id);
    if (!current || at > time(current.finalized_at ?? current.updated_at ?? current.created_at)) {
      latestInspectionByAsset.set(row.vehicle_id, row);
    }
  }

  const nextBookingByAsset = new Map<string, { startsAt: string; status: string }>();
  for (const row of bookings) {
    if (!row.vehicle_id || TERMINAL_APPOINTMENT_STATUSES.has(normalizedState(row.status))) continue;
    const current = nextBookingByAsset.get(row.vehicle_id);
    if (!current || time(row.starts_at) < time(current.startsAt)) {
      nextBookingByAsset.set(row.vehicle_id, { startsAt: row.starts_at, status: row.status });
    }
  }

  for (const assetId of assetIds) {
    const rows = workOrdersByAsset.get(assetId) ?? [];

    // Last service: newest serviced work order by its immutable intake time
    // (the canonical evidence ordering), shown as the pickup time when recorded.
    const serviced = rows
      .filter((row) => !isEstimateRecord(row) && SERVICED_STATES.has(normalizedState(row.status)))
      .sort((a, b) => time(b.created_at) - time(a.created_at))[0];

    let pm: EquipmentPmEvidence = { state: "not_evaluated", items: [], workOrderId: null };
    const serviceWorkOrder = serviceWorkOrderByAsset.get(assetId);
    const suggestion = serviceWorkOrder ? suggestionByWorkOrder.get(serviceWorkOrder.id) : undefined;
    if (
      serviceWorkOrder &&
      suggestion &&
      maintenanceCacheIsFresh({ cache: suggestion, workOrder: serviceWorkOrder, lines })
    ) {
      const items = maintenanceItems(suggestion);
      pm = {
        state: items.some((item) => item.overdue || item.isCritical)
          ? "overdue"
          : items.length
            ? "due"
            : "ok",
        items,
        workOrderId: serviceWorkOrder.id,
      };
    }

    const inspection = latestInspectionByAsset.get(assetId);
    result.set(assetId, {
      workOrders: rows,
      latestInspection: inspection
        ? {
            inspectionId: inspection.id,
            workOrderId: inspection.work_order_id,
            recordedAt: inspection.finalized_at ?? inspection.updated_at ?? inspection.created_at,
            findings: extractInspectionFindings(inspection.summary),
          }
        : null,
      pm,
      lastServiceAt: serviced ? serviced.picked_up_at ?? serviced.created_at : null,
      nextBooking: nextBookingByAsset.get(assetId) ?? null,
      workOrderOdometerKm: latestWorkOrderOdometer(rows),
    });
  }

  return result;
}
