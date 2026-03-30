import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type WorkOrderLineLite = Pick<
  DB["public"]["Tables"]["work_order_lines"]["Row"],
  | "id"
  | "shop_id"
  | "description"
  | "complaint"
  | "cause"
  | "correction"
  | "labor_time"
  | "price_estimate"
>;

type MenuRepairItemLite = Pick<
  DB["public"]["Tables"]["menu_repair_items"]["Row"],
  | "id"
  | "shop_id"
  | "name"
  | "active_pricing_snapshot_id"
>;

type MenuRepairItemPartLite = Pick<
  DB["public"]["Tables"]["menu_repair_item_parts"]["Row"],
  | "id"
  | "menu_repair_item_id"
  | "part_name"
  | "part_number"
  | "supplier_part_number"
  | "qty"
  | "last_seen_supplier"
>;

type PricingSnapshotInsert =
  DB["public"]["Tables"]["menu_repair_item_pricing_snapshots"]["Insert"];

type PricingPartInsert =
  DB["public"]["Tables"]["menu_repair_item_pricing_parts"]["Insert"];

function safeTrim(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function createPricingSnapshotFromWorkOrderLine(args: {
  supabase: SupabaseClient<DB>;
  workOrderLineId: string;
  menuRepairItemId: string;
  pricingValidDays?: number | null;
  uploadedBy?: string | null;
  quoteSource?: string | null;
  quoteReference?: string | null;
}) {
  const {
    supabase,
    workOrderLineId,
    menuRepairItemId,
    pricingValidDays = 30,
    uploadedBy = null,
    quoteSource = "work_order_capture",
    quoteReference = null,
  } = args;

  const { data: line, error: lineErr } = await supabase
    .from("work_order_lines")
    .select("id, shop_id, description, complaint, cause, correction, labor_time, price_estimate")
    .eq("id", workOrderLineId)
    .maybeSingle<WorkOrderLineLite>();

  if (lineErr) throw lineErr;
  if (!line?.id || !line.shop_id) {
    throw new Error("Work order line not found or missing shop_id");
  }

  const { data: repairItem, error: repairErr } = await supabase
    .from("menu_repair_items")
    .select("id, shop_id, name, active_pricing_snapshot_id")
    .eq("id", menuRepairItemId)
    .maybeSingle<MenuRepairItemLite>();

  if (repairErr) throw repairErr;
  if (!repairItem?.id || !repairItem.shop_id) {
    throw new Error("Menu repair item not found");
  }

  if (repairItem.shop_id !== line.shop_id) {
    throw new Error("Shop mismatch between work order line and repair item");
  }

  const { data: repairParts, error: repairPartsErr } = await supabase
    .from("menu_repair_item_parts")
    .select("id, menu_repair_item_id, part_name, part_number, supplier_part_number, qty, last_seen_supplier")
    .eq("menu_repair_item_id", menuRepairItemId)
    .order("sort_order", { ascending: true })
    .returns<MenuRepairItemPartLite[]>();

  if (repairPartsErr) throw repairPartsErr;

  const validDays =
    typeof pricingValidDays === "number" && Number.isFinite(pricingValidDays) && pricingValidDays > 0
      ? Math.floor(pricingValidDays)
      : 30;

  const quotedAt = new Date();
  const validUntil = new Date(quotedAt.getTime() + validDays * 24 * 60 * 60 * 1000);

  const snapshotInsert: PricingSnapshotInsert = {
    menu_repair_item_id: menuRepairItemId,
    shop_id: line.shop_id,
    supplier_name: null,
    quote_source: safeTrim(quoteSource) ?? "work_order_capture",
    quote_reference: safeTrim(quoteReference),
    quoted_at: quotedAt.toISOString(),
    valid_until: validUntil.toISOString(),
    pricing_valid_days: validDays,
    total_cost: null,
    total_sell: numOrNull(line.price_estimate),
    currency: "CAD",
    status: "fresh",
    uploaded_by: uploadedBy,
  };

  const { data: snapshot, error: snapshotErr } = await supabase
    .from("menu_repair_item_pricing_snapshots")
    .insert(snapshotInsert)
    .select("id")
    .single();

  if (snapshotErr) throw snapshotErr;
  if (!snapshot?.id) {
    throw new Error("Failed to create pricing snapshot");
  }

  const pricingPartRows: PricingPartInsert[] = (repairParts ?? []).map((part) => ({
    pricing_snapshot_id: snapshot.id,
    menu_repair_item_part_id: part.id,
    part_name: part.part_name,
    part_number: part.part_number,
    supplier_part_number: part.supplier_part_number,
    supplier_name: part.last_seen_supplier,
    qty: typeof part.qty === "number" && Number.isFinite(part.qty) ? part.qty : 1,
    unit_cost: null,
    unit_sell: null,
    line_total_cost: null,
    line_total_sell: null,
    currency: "CAD",
  }));

  if (pricingPartRows.length > 0) {
    const { error: partsInsertErr } = await supabase
      .from("menu_repair_item_pricing_parts")
      .insert(pricingPartRows);

    if (partsInsertErr) throw partsInsertErr;
  }

  const { error: updateRepairErr } = await supabase
    .from("menu_repair_items")
    .update({
      active_pricing_snapshot_id: snapshot.id,
    })
    .eq("id", menuRepairItemId);

  if (updateRepairErr) throw updateRepairErr;

  if (repairItem.active_pricing_snapshot_id) {
    await supabase
      .from("menu_repair_item_pricing_snapshots")
      .update({ status: "superseded" })
      .eq("id", repairItem.active_pricing_snapshot_id);
  }

  return {
    ok: true,
    pricingSnapshotId: snapshot.id,
    menuRepairItemId,
    workOrderLineId,
  };
}
