import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

export type ActiveMenuRepairPricingSnapshot = {
  snapshotId: string;
  pricingStatus: "fresh" | "stale" | "expired";
  pricingValidDays: number;
  quotedAt: string | null;
  validUntil: string | null;
  totalCost: number | null;
  totalSell: number | null;
  supplierId: string | null;
  supplierName: string | null;
  currency: string | null;
  parts: Array<{
    id: string;
    menuRepairItemPartId: string | null;
    partName: string;
    quotedPartNumber: string | null;
    supplierPartNumber: string | null;
    qty: number | null;
    unitCost: number | null;
    unitSell: number | null;
    availability: string | null;
    leadTime: string | null;
    coreCharge: number | null;
    freight: number | null;
    notes: string | null;
    matchConfidence: number | null;
  }>;
} | null;

function computePricingStatus(validUntil: string | null): "fresh" | "stale" | "expired" {
  if (!validUntil) return "expired";

  const now = Date.now();
  const ts = new Date(validUntil).getTime();
  if (!Number.isFinite(ts)) return "expired";

  if (ts < now) return "expired";
  if (ts < now + 3 * 24 * 60 * 60 * 1000) return "stale";
  return "fresh";
}

export async function getActiveMenuRepairPricingSnapshot(args: {
  supabase: SupabaseClient<DB>;
  menuRepairItemId: string;
}): Promise<ActiveMenuRepairPricingSnapshot> {
  const { supabase, menuRepairItemId } = args;

  const { data: repairItem, error: repairErr } = await supabase
    .from("menu_repair_items")
    .select("id, active_pricing_snapshot_id")
    .eq("id", menuRepairItemId)
    .maybeSingle();

  if (repairErr || !repairItem?.active_pricing_snapshot_id) {
    return null;
  }

  const { data: snapshot, error: snapshotErr } = await supabase
    .from("menu_repair_item_pricing_snapshots")
    .select(
      "id, pricing_valid_days, quoted_at, valid_until, total_cost, total_sell, supplier_id, supplier_name, currency",
    )
    .eq("id", repairItem.active_pricing_snapshot_id)
    .maybeSingle();

  if (snapshotErr || !snapshot?.id) {
    return null;
  }

  const { data: parts, error: partsErr } = await supabase
    .from("menu_repair_item_pricing_parts")
    .select(
      "id, menu_repair_item_part_id, part_name, quoted_part_number, supplier_part_number, qty, unit_cost, unit_sell, availability, lead_time, core_charge, freight, notes, match_confidence",
    )
    .eq("pricing_snapshot_id", snapshot.id)
    .order("created_at", { ascending: true });

  if (partsErr) {
    return null;
  }

  return {
    snapshotId: snapshot.id,
    pricingStatus: computePricingStatus(snapshot.valid_until),
    pricingValidDays:
      typeof snapshot.pricing_valid_days === "number" ? snapshot.pricing_valid_days : 30,
    quotedAt: snapshot.quoted_at ?? null,
    validUntil: snapshot.valid_until ?? null,
    totalCost: snapshot.total_cost ?? null,
    totalSell: snapshot.total_sell ?? null,
    supplierId: snapshot.supplier_id ?? null,
    supplierName: snapshot.supplier_name ?? null,
    currency: snapshot.currency ?? null,
    parts: (parts ?? []).map((part) => ({
      id: part.id,
      menuRepairItemPartId: part.menu_repair_item_part_id ?? null,
      partName: part.part_name,
      quotedPartNumber: part.quoted_part_number ?? null,
      supplierPartNumber: part.supplier_part_number ?? null,
      qty: part.qty ?? null,
      unitCost: part.unit_cost ?? null,
      unitSell: part.unit_sell ?? null,
      availability: part.availability ?? null,
      leadTime: part.lead_time ?? null,
      coreCharge: part.core_charge ?? null,
      freight: part.freight ?? null,
      notes: part.notes ?? null,
      matchConfidence: part.match_confidence ?? null,
    })),
  };
}
