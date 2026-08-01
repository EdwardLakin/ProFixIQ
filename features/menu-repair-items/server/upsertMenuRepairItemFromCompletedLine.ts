import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@shared/types/types/supabase";
import { getShopPricingValidDays } from "@/features/menu-repair-items/server/getShopPricingValidDays";
import {
  COMPLETED_REPAIR_SOURCE,
  buildCompletedRepairTemplateKey,
  completedNetQuantity,
  isCompletedRepairStatus,
} from "@/features/menu-repair-items/lib/completedRepair";

type DB = Database;
type WorkOrderLineRow = DB["public"]["Tables"]["work_order_lines"]["Row"];
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];
type WorkOrderPartRow = DB["public"]["Tables"]["work_order_parts"]["Row"];
type QuoteLineRow = DB["public"]["Tables"]["work_order_quote_lines"]["Row"];
type ShopRow = DB["public"]["Tables"]["shops"]["Row"];
type MenuRepairItemRow = DB["public"]["Tables"]["menu_repair_items"]["Row"];
type MenuRepairItemInsert = DB["public"]["Tables"]["menu_repair_items"]["Insert"];
type MenuRepairItemUpdate = DB["public"]["Tables"]["menu_repair_items"]["Update"];
type MenuRepairPartInsert = DB["public"]["Tables"]["menu_repair_item_parts"]["Insert"];
type PricingPartInsert =
  DB["public"]["Tables"]["menu_repair_item_pricing_parts"]["Insert"];
type PricingSnapshotInsert =
  DB["public"]["Tables"]["menu_repair_item_pricing_snapshots"]["Insert"];

type WorkOrderLineLite = Pick<
  WorkOrderLineRow,
  | "id"
  | "shop_id"
  | "work_order_id"
  | "vehicle_id"
  | "description"
  | "complaint"
  | "cause"
  | "correction"
  | "notes"
  | "labor_time"
  | "price_estimate"
  | "status"
  | "updated_at"
>;

type WorkOrderLite = Pick<
  WorkOrderRow,
  | "id"
  | "shop_id"
  | "vehicle_id"
  | "vehicle_year"
  | "vehicle_make"
  | "vehicle_model"
  | "vehicle_submodel"
  | "vehicle_engine"
  | "vehicle_drivetrain"
  | "vehicle_transmission"
  | "vehicle_fuel_type"
>;

type VehicleLite = Pick<
  VehicleRow,
  | "id"
  | "shop_id"
  | "year"
  | "make"
  | "model"
  | "submodel"
  | "engine"
  | "engine_family"
  | "engine_type"
  | "drivetrain"
  | "transmission"
  | "transmission_type"
  | "fuel_type"
>;

type WorkOrderPartLite = Pick<
  WorkOrderPartRow,
  | "id"
  | "description_snapshot"
  | "manufacturer_snapshot"
  | "part_number_snapshot"
  | "sku_snapshot"
  | "supplier_snapshot"
  | "vendor_snapshot"
  | "quantity_consumed"
  | "quantity_returned"
  | "unit_cost_snapshot"
  | "unit_sell_price_snapshot"
  | "unit_price"
  | "is_active"
>;

type QuoteLineLite = Pick<
  QuoteLineRow,
  | "id"
  | "labor_total"
  | "parts_total"
  | "grand_total"
  | "subtotal"
  | "updated_at"
>;

type ShopLite = Pick<ShopRow, "labor_rate" | "country">;

type ExistingRepairItem = Pick<
  MenuRepairItemRow,
  | "id"
  | "usage_count"
  | "active_pricing_snapshot_id"
  | "source_work_order_line_id"
>;

type LearnedPart = {
  sourceId: string;
  name: string;
  qty: number;
  unitCost: number | null;
  unitSell: number | null;
  partNumber: string | null;
  supplier: string | null;
  manufacturer: string | null;
};

export type UpsertMenuRepairItemFromCompletedLineResult = {
  ok: true;
  menuRepairItemId: string;
  pricingSnapshotId: string | null;
  updated: boolean;
  replayed: boolean;
  templateKey: string;
  partsLearned: number;
};

function safeTrim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function nonNegative(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed == null ? null : Math.max(0, parsed);
}

export function learnedPartFromCompletedWorkOrderPart(
  part: WorkOrderPartLite,
): LearnedPart | null {
  if (part.is_active !== true) return null;
  const qty = completedNetQuantity(part.quantity_consumed, part.quantity_returned);
  if (qty <= 0) return null;

  const name =
    safeTrim(part.description_snapshot) ||
    safeTrim(part.manufacturer_snapshot) ||
    safeTrim(part.part_number_snapshot) ||
    safeTrim(part.sku_snapshot);
  if (!name) return null;

  return {
    sourceId: part.id,
    name,
    qty,
    unitCost: nonNegative(part.unit_cost_snapshot),
    unitSell: nonNegative(part.unit_sell_price_snapshot ?? part.unit_price),
    partNumber: safeTrim(part.part_number_snapshot ?? part.sku_snapshot) || null,
    supplier: safeTrim(part.supplier_snapshot ?? part.vendor_snapshot) || null,
    manufacturer: safeTrim(part.manufacturer_snapshot) || null,
  };
}

function totalFor(
  parts: LearnedPart[],
  selectUnit: (part: LearnedPart) => number | null,
): number | null {
  if (parts.length === 0) return 0;
  const units = parts.map((part) => selectUnit(part));
  if (units.some((unit) => unit == null)) return null;
  return parts.reduce(
    (sum, part, index) => sum + (units[index] ?? 0) * part.qty,
    0,
  );
}

function addDays(iso: string, days: number): string {
  const date = new Date(iso);
  return new Date(date.getTime() + days * 86_400_000).toISOString();
}

export async function upsertMenuRepairItemFromCompletedLine(args: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  workOrderLineId: string;
  actorUserId?: string | null;
  nowIso?: string;
}): Promise<UpsertMenuRepairItemFromCompletedLineResult> {
  const {
    supabase,
    shopId,
    workOrderLineId,
    actorUserId = null,
    nowIso = new Date().toISOString(),
  } = args;

  const { data: line, error: lineError } = await supabase
    .from("work_order_lines")
    .select(
      "id, shop_id, work_order_id, vehicle_id, description, complaint, cause, correction, notes, labor_time, price_estimate, status, updated_at",
    )
    .eq("id", workOrderLineId)
    .eq("shop_id", shopId)
    .maybeSingle<WorkOrderLineLite>();
  if (lineError) throw lineError;
  if (!line?.id) throw new Error("Work order line not found for this shop");
  if (!isCompletedRepairStatus(line.status)) {
    throw new Error("Repair memory can only be updated from completed work");
  }

  const { data: workOrder, error: workOrderError } = await supabase
    .from("work_orders")
    .select(
      "id, shop_id, vehicle_id, vehicle_year, vehicle_make, vehicle_model, vehicle_submodel, vehicle_engine, vehicle_drivetrain, vehicle_transmission, vehicle_fuel_type",
    )
    .eq("id", line.work_order_id)
    .eq("shop_id", shopId)
    .maybeSingle<WorkOrderLite>();
  if (workOrderError) throw workOrderError;
  if (!workOrder?.id) throw new Error("Work order not found for this shop");

  const vehicleId = line.vehicle_id ?? workOrder.vehicle_id;
  let vehicle: VehicleLite | null = null;
  if (vehicleId) {
    const { data: vehicleRow, error: vehicleError } = await supabase
      .from("vehicles")
      .select(
        "id, shop_id, year, make, model, submodel, engine, engine_family, engine_type, drivetrain, transmission, transmission_type, fuel_type",
      )
      .eq("id", vehicleId)
      .eq("shop_id", shopId)
      .maybeSingle<VehicleLite>();
    if (vehicleError) throw vehicleError;
    vehicle = vehicleRow ?? null;
  }

  const { data: partRows, error: partsError } = await supabase
    .from("work_order_parts")
    .select(
      "id, description_snapshot, manufacturer_snapshot, part_number_snapshot, sku_snapshot, supplier_snapshot, vendor_snapshot, quantity_consumed, quantity_returned, unit_cost_snapshot, unit_sell_price_snapshot, unit_price, is_active",
    )
    .eq("shop_id", shopId)
    .eq("work_order_id", workOrder.id)
    .eq("work_order_line_id", line.id)
    .returns<WorkOrderPartLite[]>();
  if (partsError) throw partsError;
  const learnedParts = (partRows ?? [])
    .map(learnedPartFromCompletedWorkOrderPart)
    .filter((part): part is LearnedPart => part !== null);

  const { data: quoteLine, error: quoteError } = await supabase
    .from("work_order_quote_lines")
    .select("id, labor_total, parts_total, grand_total, subtotal, updated_at")
    .eq("shop_id", shopId)
    .eq("work_order_id", workOrder.id)
    .eq("work_order_line_id", line.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<QuoteLineLite>();
  if (quoteError) throw quoteError;

  const { data: shop, error: shopError } = await supabase
    .from("shops")
    .select("labor_rate, country")
    .eq("id", shopId)
    .maybeSingle<ShopLite>();
  if (shopError) throw shopError;

  const vehicleYear = finiteNumber(vehicle?.year ?? workOrder.vehicle_year);
  const vehicleMake = safeTrim(vehicle?.make ?? workOrder.vehicle_make) || null;
  const vehicleModel = safeTrim(vehicle?.model ?? workOrder.vehicle_model) || null;
  const vehicleSubmodel = safeTrim(vehicle?.submodel ?? workOrder.vehicle_submodel) || null;
  const engine =
    safeTrim(vehicle?.engine) ||
    safeTrim(vehicle?.engine_family) ||
    safeTrim(vehicle?.engine_type) ||
    safeTrim(workOrder.vehicle_engine) ||
    null;
  const drivetrain = safeTrim(vehicle?.drivetrain ?? workOrder.vehicle_drivetrain) || null;
  const transmission =
    safeTrim(vehicle?.transmission) ||
    safeTrim(vehicle?.transmission_type) ||
    safeTrim(workOrder.vehicle_transmission) ||
    null;
  const fuelType = safeTrim(vehicle?.fuel_type ?? workOrder.vehicle_fuel_type) || null;

  const name = safeTrim(line.description) || safeTrim(line.complaint) || "Completed repair";
  const complaint = safeTrim(line.complaint) || null;
  const cause = safeTrim(line.cause) || null;
  const correction = safeTrim(line.correction) || null;
  const notes = safeTrim(line.notes) || null;
  const laborHours = nonNegative(line.labor_time);
  const shopLaborRate = nonNegative(shop?.labor_rate);
  const currency = shop?.country === "CA" ? "CAD" : "USD";
  const quoteLaborTotal = nonNegative(quoteLine?.labor_total);
  const laborRate =
    laborHours != null && laborHours > 0 && quoteLaborTotal != null
      ? quoteLaborTotal / laborHours
      : shopLaborRate;
  const partSellTotal = totalFor(learnedParts, (part) => part.unitSell);
  const partCostTotal = totalFor(learnedParts, (part) => part.unitCost);
  const calculatedTotal =
    laborHours != null && laborRate != null && partSellTotal != null
      ? laborHours * laborRate + partSellTotal
      : null;
  const completedTotal =
    calculatedTotal ??
    nonNegative(line.price_estimate) ??
    nonNegative(quoteLine?.subtotal ?? quoteLine?.grand_total);
  const completedAt = line.updated_at || nowIso;

  const templateKey = buildCompletedRepairTemplateKey({
    shopId,
    year: vehicleYear,
    make: vehicleMake,
    model: vehicleModel,
    submodel: vehicleSubmodel,
    engine,
    drivetrain,
    transmission,
    title: name,
  });

  let existing: ExistingRepairItem | null = null;
  const directResult = await supabase
    .from("menu_repair_items")
    .select("id, usage_count, active_pricing_snapshot_id, source_work_order_line_id")
    .eq("shop_id", shopId)
    .eq("source_work_order_line_id", line.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<ExistingRepairItem>();
  if (directResult.error) throw directResult.error;
  existing = directResult.data ?? null;

  if (!existing) {
    const templateResult = await supabase
      .from("menu_repair_items")
      .select("id, usage_count, active_pricing_snapshot_id, source_work_order_line_id")
      .eq("shop_id", shopId)
      .eq("template_key", templateKey)
      .limit(1)
      .maybeSingle<ExistingRepairItem>();
    if (templateResult.error) throw templateResult.error;
    existing = templateResult.data ?? null;
  }

  let replayed = false;
  let completedUsageCount = 1;
  if (existing) {
    const priorSnapshots = await supabase
      .from("menu_repair_item_pricing_snapshots")
      .select("source_work_order_line_id")
      .eq("shop_id", shopId)
      .eq("menu_repair_item_id", existing.id)
      .eq("quote_source", COMPLETED_REPAIR_SOURCE)
      .not("source_work_order_line_id", "is", null)
      .returns<Array<{ source_work_order_line_id: string | null }>>();
    if (priorSnapshots.error) throw priorSnapshots.error;
    const completedSourceLineIds = new Set(
      (priorSnapshots.data ?? [])
        .map((snapshot) => snapshot.source_work_order_line_id)
        .filter((sourceId): sourceId is string => Boolean(sourceId)),
    );
    replayed = completedSourceLineIds.has(line.id);
    completedSourceLineIds.add(line.id);
    completedUsageCount = completedSourceLineIds.size;
  }

  const partsJson = learnedParts.map((part) => ({
    name: part.name,
    qty: part.qty,
    unit_cost: part.unitCost,
    unit_price: part.unitSell,
    part_number: part.partNumber,
    supplier: part.supplier,
    manufacturer: part.manufacturer,
    source_work_order_part_id: part.sourceId,
  })) as unknown as Json;

  const commonPayload = {
    source_quote_line_id: quoteLine?.id ?? null,
    source_work_order_id: workOrder.id,
    source_work_order_line_id: line.id,
    name,
    complaint,
    cause,
    correction,
    notes,
    vehicle_year: vehicleYear,
    vehicle_make: vehicleMake,
    vehicle_model: vehicleModel,
    engine,
    drivetrain,
    transmission,
    fuel_type: fuelType,
    labor_hours: laborHours,
    labor_rate: laborRate,
    price_estimate: completedTotal,
    parts: partsJson,
    template_key: templateKey,
    is_active: true,
    last_pricing_refresh_at: completedAt,
    last_pricing_source: COMPLETED_REPAIR_SOURCE,
    pricing_status: "fresh",
    updated_at: nowIso,
  } satisfies MenuRepairItemUpdate;

  let menuRepairItemId: string;
  let activePricingSnapshotId: string | null = null;
  const updated = Boolean(existing?.id);
  if (existing?.id) {
    const updatePayload: MenuRepairItemUpdate = {
      ...commonPayload,
      // Legacy rows were sometimes counted at quote/approval time. Rebuild the
      // count only from distinct completed-line snapshots so those events do
      // not leak into completed-work usage.
      usage_count: completedUsageCount,
    };
    const { error: updateError } = await supabase
      .from("menu_repair_items")
      .update(updatePayload)
      .eq("shop_id", shopId)
      .eq("id", existing.id);
    if (updateError) throw updateError;
    menuRepairItemId = existing.id;
    activePricingSnapshotId = existing.active_pricing_snapshot_id;
  } else {
    const insertPayload: MenuRepairItemInsert = {
      ...commonPayload,
      shop_id: shopId,
      usage_count: 1,
    };
    const { data: inserted, error: insertError } = await supabase
      .from("menu_repair_items")
      .insert(insertPayload)
      .select("id")
      .single();
    if (insertError) throw insertError;
    if (!inserted?.id) throw new Error("Failed to create completed repair memory");
    menuRepairItemId = inserted.id;
  }

  const { error: deleteRepairPartsError } = await supabase
    .from("menu_repair_item_parts")
    .delete()
    .eq("shop_id", shopId)
    .eq("menu_repair_item_id", menuRepairItemId);
  if (deleteRepairPartsError) throw deleteRepairPartsError;

  const repairPartRows: MenuRepairPartInsert[] = learnedParts.map((part, index) => ({
    shop_id: shopId,
    menu_repair_item_id: menuRepairItemId,
    part_name: part.name,
    part_number: part.partNumber,
    supplier_part_number: null,
    qty: part.qty,
    last_seen_supplier: part.supplier,
    fitment_notes: part.manufacturer ? `Manufacturer: ${part.manufacturer}` : null,
    sort_order: index,
    is_required: true,
  }));
  let insertedRepairParts: Array<{ id: string; sort_order: number }> = [];
  if (repairPartRows.length > 0) {
    const { data: insertedParts, error: insertPartsError } = await supabase
      .from("menu_repair_item_parts")
      .insert(repairPartRows)
      .select("id, sort_order")
      .returns<Array<{ id: string; sort_order: number }>>();
    if (insertPartsError) throw insertPartsError;
    insertedRepairParts = [...(insertedParts ?? [])].sort(
      (left, right) => left.sort_order - right.sort_order,
    );
  }

  const pricingValidDays = await getShopPricingValidDays({
    supabase,
    shopId,
    fallback: 30,
  });
  const quotedAt = completedAt;
  const validUntil = addDays(quotedAt, pricingValidDays);
  const snapshotPayload: PricingSnapshotInsert = {
    shop_id: shopId,
    menu_repair_item_id: menuRepairItemId,
    quote_source: COMPLETED_REPAIR_SOURCE,
    quote_reference: line.id,
    quoted_at: quotedAt,
    valid_until: validUntil,
    pricing_valid_days: pricingValidDays,
    total_cost: partCostTotal,
    // Pricing snapshots describe the reusable parts quote. Labor is stored on
    // the repair item and is added separately when the repair is reused.
    total_sell: partSellTotal,
    currency,
    status: "fresh",
    uploaded_by: actorUserId,
    source_quote_line_id: quoteLine?.id ?? null,
    source_work_order_line_id: line.id,
    updated_at: nowIso,
  };

  const existingSnapshotResult = await supabase
    .from("menu_repair_item_pricing_snapshots")
    .select("id")
    .eq("shop_id", shopId)
    .eq("menu_repair_item_id", menuRepairItemId)
    .eq("source_work_order_line_id", line.id)
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (existingSnapshotResult.error) throw existingSnapshotResult.error;

  let pricingSnapshotId = existingSnapshotResult.data?.id ?? null;
  if (pricingSnapshotId) {
    const { error: updateSnapshotError } = await supabase
      .from("menu_repair_item_pricing_snapshots")
      .update(snapshotPayload)
      .eq("shop_id", shopId)
      .eq("id", pricingSnapshotId);
    if (updateSnapshotError) throw updateSnapshotError;
  } else {
    const { data: snapshot, error: insertSnapshotError } = await supabase
      .from("menu_repair_item_pricing_snapshots")
      .insert(snapshotPayload)
      .select("id")
      .single();
    if (insertSnapshotError) throw insertSnapshotError;
    pricingSnapshotId = snapshot?.id ?? null;
  }

  if (pricingSnapshotId) {
    const { error: deletePricingPartsError } = await supabase
      .from("menu_repair_item_pricing_parts")
      .delete()
      .eq("pricing_snapshot_id", pricingSnapshotId);
    if (deletePricingPartsError) throw deletePricingPartsError;

    const pricingPartRows: PricingPartInsert[] = learnedParts.map((part, index) => ({
      pricing_snapshot_id: pricingSnapshotId as string,
      menu_repair_item_part_id: insertedRepairParts[index]?.id ?? null,
      part_name: part.name,
      quoted_part_number: part.partNumber,
      supplier_part_number: null,
      qty: part.qty,
      unit_cost: part.unitCost,
      unit_sell: part.unitSell,
      notes: [
        part.supplier ? `Supplier: ${part.supplier}` : null,
        part.manufacturer ? `Manufacturer: ${part.manufacturer}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || null,
    }));
    if (pricingPartRows.length > 0) {
      const { error: insertPricingPartsError } = await supabase
        .from("menu_repair_item_pricing_parts")
        .insert(pricingPartRows);
      if (insertPricingPartsError) throw insertPricingPartsError;
    }

    const { error: activateError } = await supabase
      .from("menu_repair_items")
      .update({
        active_pricing_snapshot_id: pricingSnapshotId,
        pricing_valid_days: pricingValidDays,
      })
      .eq("shop_id", shopId)
      .eq("id", menuRepairItemId);
    if (activateError) throw activateError;

    if (activePricingSnapshotId && activePricingSnapshotId !== pricingSnapshotId) {
      await supabase
        .from("menu_repair_item_pricing_snapshots")
        .update({ status: "superseded" })
        .eq("shop_id", shopId)
        .eq("id", activePricingSnapshotId);
    }
  }

  return {
    ok: true,
    menuRepairItemId,
    pricingSnapshotId,
    updated,
    replayed,
    templateKey,
    partsLearned: learnedParts.length,
  };
}
