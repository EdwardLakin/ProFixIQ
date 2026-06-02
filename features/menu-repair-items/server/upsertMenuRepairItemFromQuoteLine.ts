import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@shared/types/types/supabase";
import { getShopPricingValidDays } from "@/features/menu-repair-items/server/getShopPricingValidDays";

type DB = Database;

type QuoteLineRow = DB["public"]["Tables"]["work_order_quote_lines"]["Row"];
type WorkOrderLineRow = DB["public"]["Tables"]["work_order_lines"]["Row"];
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];
type PartRequestItemRow = DB["public"]["Tables"]["part_request_items"]["Row"];
type MenuRepairItemInsert = DB["public"]["Tables"]["menu_repair_items"]["Insert"];
type MenuRepairItemUpdate = DB["public"]["Tables"]["menu_repair_items"]["Update"];
type PricingSnapshotInsert = DB["public"]["Tables"]["menu_repair_item_pricing_snapshots"]["Insert"];
type PricingPartInsert = DB["public"]["Tables"]["menu_repair_item_pricing_parts"]["Insert"];

type QuoteLineLite = Pick<
  QuoteLineRow,
  | "id"
  | "shop_id"
  | "work_order_id"
  | "work_order_line_id"
  | "vehicle_id"
  | "description"
  | "ai_complaint"
  | "ai_cause"
  | "ai_correction"
  | "notes"
  | "labor_hours"
  | "est_labor_hours"
  | "labor_total"
  | "parts_total"
  | "subtotal"
  | "tax_total"
  | "grand_total"
  | "metadata"
  | "sent_to_customer_at"
  | "approved_at"
  | "created_at"
>;

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
>;

type WorkOrderLite = Pick<
  WorkOrderRow,
  | "id"
  | "shop_id"
  | "vehicle_id"
  | "vehicle_year"
  | "vehicle_make"
  | "vehicle_model"
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
  | "engine"
  | "engine_family"
  | "engine_type"
  | "drivetrain"
  | "transmission"
  | "transmission_type"
  | "fuel_type"
  | "submodel"
>;

type PartRequestItemLite = Pick<
  PartRequestItemRow,
  | "id"
  | "shop_id"
  | "work_order_id"
  | "quote_line_id"
  | "work_order_line_id"
  | "description"
  | "qty"
  | "qty_requested"
  | "quoted_price"
  | "unit_price"
  | "unit_cost"
  | "vendor"
>;

type MenuRepairItemLite = Pick<
  DB["public"]["Tables"]["menu_repair_items"]["Row"],
  | "id"
  | "shop_id"
  | "usage_count"
  | "active_pricing_snapshot_id"
  | "source_quote_line_id"
>;

type LearnedPart = {
  id?: string;
  name: string;
  qty: number;
  unitCost: number | null;
  unitSell: number | null;
  quotedPrice: number | null;
  vendor: string | null;
  partNumber: string | null;
  supplierPartNumber: string | null;
  notes: string | null;
};

export type UpsertMenuRepairItemFromQuoteLineResult = {
  ok: true;
  menuRepairItemId: string;
  pricingSnapshotId: string | null;
  updated: boolean;
  templateKey: string;
  partsLearned: number;
};

function safeTrim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function numOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const parsed = Number(v);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function nonNegative(v: unknown): number | null {
  const n = numOrNull(v);
  if (n == null) return null;
  return n < 0 ? 0 : n;
}

function positiveQty(v: unknown): number {
  const n = nonNegative(v);
  return n && n > 0 ? n : 1;
}

function compactKeyPart(v: unknown): string {
  return (
    safeTrim(v)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "na"
  );
}

function metadataRecord(metadata: Json | null): Record<string, Json> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, Json>)
    : {};
}

function buildTemplateKey(args: {
  shopId: string;
  year: number | null;
  make: string | null;
  model: string | null;
  submodel: string | null;
  engine: string | null;
  drivetrain: string | null;
  transmission: string | null;
  title: string;
  complaint: string | null;
  description: string | null;
}): string {
  return [
    args.shopId,
    args.year ?? "na",
    compactKeyPart(args.make),
    compactKeyPart(args.model),
    compactKeyPart(args.submodel),
    compactKeyPart(args.engine),
    compactKeyPart(args.drivetrain),
    compactKeyPart(args.transmission),
    compactKeyPart(args.title || args.complaint || args.description || "repair"),
  ].join("::");
}

function partFromMetadata(raw: unknown): LearnedPart | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const name =
    safeTrim(record.name) ||
    safeTrim(record.description) ||
    safeTrim(record.part_name) ||
    safeTrim(record.label);
  if (!name) return null;

  return {
    name,
    qty: positiveQty(record.qty ?? record.quantity),
    unitCost: nonNegative(record.unitCost ?? record.unit_cost ?? record.cost),
    unitSell: nonNegative(record.unitPrice ?? record.unit_price ?? record.price ?? record.sell),
    quotedPrice: nonNegative(record.quotedPrice ?? record.quoted_price),
    vendor: safeTrim(record.vendor ?? record.supplier ?? record.supplier_name) || null,
    partNumber: safeTrim(record.partNumber ?? record.part_number ?? record.sku) || null,
    supplierPartNumber: safeTrim(record.supplierPartNumber ?? record.supplier_part_number) || null,
    notes: safeTrim(record.notes) || null,
  };
}

function metadataParts(line: QuoteLineLite): LearnedPart[] {
  const parts = metadataRecord(line.metadata).parts;
  if (!Array.isArray(parts)) return [];
  return parts.map(partFromMetadata).filter((part): part is LearnedPart => part !== null);
}

function partsFromRequestItems(items: PartRequestItemLite[]): LearnedPart[] {
  return items
    .map<LearnedPart | null>((item) => {
      const name = safeTrim(item.description);
      if (!name) return null;
      return {
        id: item.id,
        name,
        qty: positiveQty(item.qty_requested ?? item.qty),
        unitCost: nonNegative(item.unit_cost),
        unitSell: nonNegative(item.quoted_price ?? item.unit_price),
        quotedPrice: nonNegative(item.quoted_price),
        vendor: safeTrim(item.vendor) || null,
        partNumber: null,
        supplierPartNumber: null,
        notes: null,
      };
    })
    .filter((part): part is LearnedPart => part !== null);
}

function partsTotal(parts: LearnedPart[]): number | null {
  if (parts.length === 0) return 0;
  let total = 0;
  let hasAny = false;
  for (const part of parts) {
    const unitSell = part.quotedPrice ?? part.unitSell;
    if (unitSell == null) continue;
    total += unitSell * part.qty;
    hasAny = true;
  }
  return hasAny ? total : null;
}

function partsCostTotal(parts: LearnedPart[]): number | null {
  if (parts.length === 0) return 0;
  let total = 0;
  let hasAny = false;
  for (const part of parts) {
    if (part.unitCost == null) continue;
    total += part.unitCost * part.qty;
    hasAny = true;
  }
  return hasAny ? total : null;
}

function isoAddDays(date: Date, days: number): string {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

async function loadLinkedPartRequestItems(args: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  workOrderId: string;
  quoteLineId: string;
  workOrderLineId: string;
}): Promise<PartRequestItemLite[]> {
  const { supabase, shopId, workOrderId, quoteLineId, workOrderLineId } = args;
  const { data, error } = await supabase
    .from("part_request_items")
    .select(
      "id, shop_id, work_order_id, quote_line_id, work_order_line_id, description, qty, qty_requested, quoted_price, unit_price, unit_cost, vendor",
    )
    .eq("shop_id", shopId)
    .eq("work_order_id", workOrderId)
    .or(`quote_line_id.eq.${quoteLineId},work_order_line_id.eq.${workOrderLineId}`)
    .returns<PartRequestItemLite[]>();

  if (error) throw error;
  return data ?? [];
}

async function createQuoteLinePricingSnapshot(args: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  menuRepairItemId: string;
  activePricingSnapshotId: string | null;
  quoteLine: QuoteLineLite;
  workOrderLineId: string;
  actorUserId: string | null;
  pricingValidDays: number;
  laborTotal: number | null;
  partSellTotal: number | null;
  partCostTotal: number | null;
  grandTotal: number | null;
  parts: LearnedPart[];
}): Promise<string> {
  const {
    supabase,
    shopId,
    menuRepairItemId,
    activePricingSnapshotId,
    quoteLine,
    workOrderLineId,
    actorUserId,
    pricingValidDays,
    laborTotal,
    partSellTotal,
    partCostTotal,
    grandTotal,
    parts,
  } = args;

  const quotedAt = new Date(
    quoteLine.approved_at ?? quoteLine.sent_to_customer_at ?? quoteLine.created_at ?? Date.now(),
  );
  const quotedAtIso = Number.isNaN(quotedAt.getTime()) ? new Date().toISOString() : quotedAt.toISOString();
  const validUntil = isoAddDays(new Date(quotedAtIso), pricingValidDays);
  const totalSell =
    grandTotal ??
    numOrNull(quoteLine.subtotal) ??
    ((laborTotal ?? 0) + (partSellTotal ?? 0) || null);

  const snapshotPayload: PricingSnapshotInsert = {
    menu_repair_item_id: menuRepairItemId,
    shop_id: shopId,
    supplier_name: null,
    quote_source: "approved_quote_line",
    quote_reference: quoteLine.id,
    quoted_at: quotedAtIso,
    valid_until: validUntil,
    pricing_valid_days: pricingValidDays,
    total_cost: partCostTotal,
    total_sell: totalSell,
    currency: "CAD",
    status: "fresh",
    uploaded_by: actorUserId,
    source_quote_line_id: quoteLine.id,
    source_work_order_line_id: workOrderLineId,
  };

  const { data: existingSnapshot, error: existingSnapshotErr } = await supabase
    .from("menu_repair_item_pricing_snapshots")
    .select("id")
    .eq("shop_id", shopId)
    .eq("menu_repair_item_id", menuRepairItemId)
    .eq("source_quote_line_id", quoteLine.id)
    .eq("source_work_order_line_id", workOrderLineId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (existingSnapshotErr) throw existingSnapshotErr;

  let snapshotId = existingSnapshot?.id ?? null;
  if (snapshotId) {
    const { error: updateSnapshotErr } = await supabase
      .from("menu_repair_item_pricing_snapshots")
      .update(snapshotPayload)
      .eq("shop_id", shopId)
      .eq("id", snapshotId);
    if (updateSnapshotErr) throw updateSnapshotErr;

    const { error: deletePartsErr } = await supabase
      .from("menu_repair_item_pricing_parts")
      .delete()
      .eq("pricing_snapshot_id", snapshotId);
    if (deletePartsErr) throw deletePartsErr;
  } else {
    const { data: snapshot, error: snapshotErr } = await supabase
      .from("menu_repair_item_pricing_snapshots")
      .insert(snapshotPayload)
      .select("id")
      .single();

    if (snapshotErr) throw snapshotErr;
    if (!snapshot?.id) throw new Error("Failed to create quote-line pricing snapshot");
    snapshotId = snapshot.id;
  }

  if (!snapshotId) throw new Error("Failed to resolve quote-line pricing snapshot");

  const pricingParts: PricingPartInsert[] = parts.map((part) => ({
    pricing_snapshot_id: snapshotId,
    menu_repair_item_part_id: null,
    part_name: part.name,
    quoted_part_number: part.partNumber,
    supplier_part_number: part.supplierPartNumber,
    qty: part.qty,
    unit_cost: part.unitCost,
    unit_sell: part.quotedPrice ?? part.unitSell,
    notes:
      [part.vendor ? `Vendor: ${part.vendor}` : null, part.notes]
        .filter((note): note is string => Boolean(note))
        .join("; ") || null,
  }));

  if (pricingParts.length > 0) {
    const { error: partsErr } = await supabase
      .from("menu_repair_item_pricing_parts")
      .insert(pricingParts);
    if (partsErr) throw partsErr;
  }

  const { error: repairUpdateErr } = await supabase
    .from("menu_repair_items")
    .update({
      active_pricing_snapshot_id: snapshotId,
      last_pricing_refresh_at: quotedAtIso,
      last_pricing_source: "approved_quote_line",
      pricing_status: "fresh",
      pricing_valid_days: pricingValidDays,
    })
    .eq("shop_id", shopId)
    .eq("id", menuRepairItemId);

  if (repairUpdateErr) throw repairUpdateErr;

  if (activePricingSnapshotId && activePricingSnapshotId !== snapshotId) {
    await supabase
      .from("menu_repair_item_pricing_snapshots")
      .update({ status: "superseded" })
      .eq("shop_id", shopId)
      .eq("id", activePricingSnapshotId);
  }

  return snapshotId;
}

export async function upsertMenuRepairItemFromQuoteLine(args: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  workOrderId: string;
  quoteLineId: string;
  workOrderLineId: string;
  actorUserId?: string | null;
}): Promise<UpsertMenuRepairItemFromQuoteLineResult> {
  const { supabase, shopId, workOrderId, quoteLineId, workOrderLineId, actorUserId = null } = args;

  const { data: quoteLine, error: quoteErr } = await supabase
    .from("work_order_quote_lines")
    .select("*")
    .eq("shop_id", shopId)
    .eq("work_order_id", workOrderId)
    .eq("id", quoteLineId)
    .maybeSingle<QuoteLineLite>();
  if (quoteErr) throw quoteErr;
  if (!quoteLine?.id) throw new Error("Quote line not found for shop/work order");

  const { data: workOrderLine, error: lineErr } = await supabase
    .from("work_order_lines")
    .select(
      "id, shop_id, work_order_id, vehicle_id, description, complaint, cause, correction, notes, labor_time, price_estimate",
    )
    .eq("shop_id", shopId)
    .eq("work_order_id", workOrderId)
    .eq("id", workOrderLineId)
    .maybeSingle<WorkOrderLineLite>();
  if (lineErr) throw lineErr;
  if (!workOrderLine?.id) throw new Error("Materialized work order line not found for shop/work order");

  const { data: workOrder, error: workOrderErr } = await supabase
    .from("work_orders")
    .select(
      "id, shop_id, vehicle_id, vehicle_year, vehicle_make, vehicle_model, vehicle_engine, vehicle_drivetrain, vehicle_transmission, vehicle_fuel_type",
    )
    .eq("shop_id", shopId)
    .eq("id", workOrderId)
    .maybeSingle<WorkOrderLite>();
  if (workOrderErr) throw workOrderErr;
  if (!workOrder?.id) throw new Error("Work order not found for shop");

  const vehicleId = quoteLine.vehicle_id ?? workOrderLine.vehicle_id ?? workOrder.vehicle_id;
  let vehicle: VehicleLite | null = null;
  if (vehicleId) {
    const { data: vehicleRow, error: vehicleErr } = await supabase
      .from("vehicles")
      .select(
        "id, shop_id, year, make, model, engine, engine_family, engine_type, drivetrain, transmission, transmission_type, fuel_type, submodel",
      )
      .eq("id", vehicleId)
      .eq("shop_id", shopId)
      .maybeSingle<VehicleLite>();
    if (vehicleErr) throw vehicleErr;
    vehicle = vehicleRow ?? null;
  }

  const { data: shop, error: shopErr } = await supabase
    .from("shops")
    .select("labor_rate")
    .eq("id", shopId)
    .maybeSingle();
  if (shopErr) throw shopErr;

  const requestItems = await loadLinkedPartRequestItems({
    supabase,
    shopId,
    workOrderId,
    quoteLineId,
    workOrderLineId,
  });
  const learnedParts = requestItems.length > 0 ? partsFromRequestItems(requestItems) : metadataParts(quoteLine);
  const learnedPartsTotal = partsTotal(learnedParts);
  const learnedPartsCostTotal = partsCostTotal(learnedParts);

  const vehicleYear =
    numOrNull(vehicle?.year) ?? numOrNull(workOrder.vehicle_year);
  const vehicleMake = safeTrim(vehicle?.make) || safeTrim(workOrder.vehicle_make) || null;
  const vehicleModel = safeTrim(vehicle?.model) || safeTrim(workOrder.vehicle_model) || null;
  const vehicleSubmodel = safeTrim(vehicle?.submodel) || null;
  const engine =
    safeTrim(vehicle?.engine) ||
    safeTrim(vehicle?.engine_family) ||
    safeTrim(vehicle?.engine_type) ||
    safeTrim(workOrder.vehicle_engine) ||
    null;
  const drivetrain = safeTrim(vehicle?.drivetrain) || safeTrim(workOrder.vehicle_drivetrain) || null;
  const transmission =
    safeTrim(vehicle?.transmission) ||
    safeTrim(vehicle?.transmission_type) ||
    safeTrim(workOrder.vehicle_transmission) ||
    null;
  const fuelType = safeTrim(vehicle?.fuel_type) || safeTrim(workOrder.vehicle_fuel_type) || null;

  const name = safeTrim(quoteLine.description) || safeTrim(workOrderLine.description) || "Repair item";
  const complaint =
    safeTrim(quoteLine.ai_complaint) ||
    safeTrim(workOrderLine.complaint) ||
    safeTrim(quoteLine.notes) ||
    null;
  const cause = safeTrim(quoteLine.ai_cause) || safeTrim(workOrderLine.cause) || null;
  const correction = safeTrim(quoteLine.ai_correction) || safeTrim(workOrderLine.correction) || null;
  const notes = safeTrim(quoteLine.notes) || safeTrim(workOrderLine.notes) || null;
  const laborHours = nonNegative(quoteLine.labor_hours ?? quoteLine.est_labor_hours ?? workOrderLine.labor_time);
  const laborTotal = nonNegative(quoteLine.labor_total);
  const laborRate =
    laborHours && laborTotal != null && laborHours > 0
      ? laborTotal / laborHours
      : nonNegative((shop as { labor_rate?: unknown } | null)?.labor_rate);
  const quotePartsTotal = nonNegative(quoteLine.parts_total) ?? learnedPartsTotal;
  const grandTotal =
    nonNegative(quoteLine.grand_total) ??
    nonNegative(quoteLine.subtotal) ??
    nonNegative(workOrderLine.price_estimate) ??
    ((laborTotal ?? 0) + (quotePartsTotal ?? 0) || null);

  const templateKey = buildTemplateKey({
    shopId,
    year: vehicleYear,
    make: vehicleMake,
    model: vehicleModel,
    submodel: vehicleSubmodel,
    engine,
    drivetrain,
    transmission,
    title: name,
    complaint,
    description: workOrderLine.description,
  });

  const partsJson = learnedParts.map((part) => ({
    name: part.name,
    qty: part.qty,
    unit_cost: part.unitCost,
    unit_price: part.unitSell,
    quoted_price: part.quotedPrice,
    vendor: part.vendor,
    part_number: part.partNumber,
    supplier_part_number: part.supplierPartNumber,
    source_part_request_item_id: part.id ?? null,
  })) as unknown as MenuRepairItemInsert["parts"];

  const now = new Date().toISOString();
  const existingResult = await supabase
    .from("menu_repair_items")
    .select("id, shop_id, usage_count, active_pricing_snapshot_id, source_quote_line_id")
    .eq("shop_id", shopId)
    .eq("template_key", templateKey)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<MenuRepairItemLite>();
  if (existingResult.error) throw existingResult.error;

  let menuRepairItemId: string;
  let activePricingSnapshotId: string | null = null;
  let updated = false;

  if (existingResult.data?.id) {
    const existing = existingResult.data;
    const usageCount =
      existing.source_quote_line_id === quoteLine.id
        ? existing.usage_count ?? 0
        : (existing.usage_count ?? 0) + 1;
    const updatePayload: MenuRepairItemUpdate = {
      source_quote_line_id: quoteLine.id,
      source_work_order_id: workOrderId,
      source_work_order_line_id: workOrderLineId,
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
      price_estimate: grandTotal,
      parts: partsJson as unknown as MenuRepairItemUpdate["parts"],
      usage_count: usageCount,
      is_active: true,
      last_pricing_refresh_at: now,
      last_pricing_source: "approved_quote_line",
      pricing_status: "fresh",
      updated_at: now,
    };

    const { error: updateErr } = await supabase
      .from("menu_repair_items")
      .update(updatePayload)
      .eq("shop_id", shopId)
      .eq("id", existing.id);
    if (updateErr) throw updateErr;

    menuRepairItemId = existing.id;
    activePricingSnapshotId = existing.active_pricing_snapshot_id;
    updated = true;
  } else {
    const insertPayload: MenuRepairItemInsert = {
      shop_id: shopId,
      source_quote_line_id: quoteLine.id,
      source_work_order_id: workOrderId,
      source_work_order_line_id: workOrderLineId,
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
      price_estimate: grandTotal,
      parts: partsJson,
      template_key: templateKey,
      usage_count: 1,
      is_active: true,
      last_pricing_refresh_at: now,
      last_pricing_source: "approved_quote_line",
      pricing_status: "fresh",
    };

    const { data: inserted, error: insertErr } = await supabase
      .from("menu_repair_items")
      .insert(insertPayload)
      .select("id")
      .single();
    if (insertErr) throw insertErr;
    if (!inserted?.id) throw new Error("Failed to create menu repair item");
    menuRepairItemId = inserted.id;
  }

  const pricingValidDays = await getShopPricingValidDays({ supabase, shopId, fallback: 30 });
  const pricingSnapshotId = await createQuoteLinePricingSnapshot({
    supabase,
    shopId,
    menuRepairItemId,
    activePricingSnapshotId,
    quoteLine,
    workOrderLineId,
    actorUserId,
    pricingValidDays,
    laborTotal,
    partSellTotal: quotePartsTotal,
    partCostTotal: learnedPartsCostTotal,
    grandTotal,
    parts: learnedParts,
  });

  return {
    ok: true,
    menuRepairItemId,
    pricingSnapshotId,
    updated,
    templateKey,
    partsLearned: learnedParts.length,
  };
}
