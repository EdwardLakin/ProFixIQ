"use server";

import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

/**
 * Resolve a scanned code (barcode or SKU) to a part_id.
 * Strategy (in order):
 *  1) parts_barcodes(code, supplier_id?) -> part_id
 *  2) parts.sku == code (case-insensitive)
 *  3) parts.part_number == code (case-insensitive; FL-500S style aliases should be normalized in a future pass)
 *  4) parts.upc == code  (if you have this column)
 */
export async function resolveScannedCode(input: {
  code: string;
  supplier_id?: string | null;
}): Promise<{ part_id: string | null }> {
  const supabase = createServerSupabaseRoute();
  const code = (input.code || "").trim();
  if (!code) return { part_id: null };

  // 1) explicit barcode mappings (recommended table)
  const { data: map } = await supabase
    .from("parts_barcodes")
    .select("part_id")
    .eq("code", code)
    .maybeSingle();

  if (map?.part_id) return { part_id: map.part_id };

  // If supplier-specific mappings exist, try them too
  if (input.supplier_id) {
    const { data: map2 } = await supabase
      .from("parts_barcodes")
      .select("part_id")
      .eq("code", code)
      .eq("supplier_id", input.supplier_id)
      .maybeSingle();
    if (map2?.part_id) return { part_id: map2.part_id };
  }

  // 2) fallback: SKU match
  const { data: bySku } = await supabase
    .from("parts")
    .select("id")
    .ilike("sku", code)
    .maybeSingle();
  if (bySku?.id) return { part_id: bySku.id };

  // 3) lightweight part number fallback for receiving scans typed as real catalog numbers.
  // TODO(parts): also compare normalized aliases (FL500S vs FL-500S) once scan lookup is centralized.
  const { data: byPartNumber } = await supabase
    .from("parts")
    .select("id")
    .ilike("part_number", code)
    .maybeSingle();
  if (byPartNumber?.id) return { part_id: byPartNumber.id };

  // 4) optional UPC column fallback (if present in your schema)
  // Comment out if you don't have this column.
  try {
    const { data: byUpc } = await supabase
      .from("parts")
      .select("id")
      .eq("upc" as never, code as never)
      .maybeSingle();
    if (byUpc?.id) return { part_id: byUpc.id };
  } catch {
    /* column may not exist */
  }

  return { part_id: null };
}