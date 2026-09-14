import { normalizePartNumber } from "@/features/parts/lib/parts/deterministicStockMatcher";
import { loadRowsForIdChunks } from "@/features/work-orders/lib/data/loadCanonicalWorkOrderLineContext";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type MenuRepairItemPart =
  DB["public"]["Tables"]["menu_repair_item_parts"]["Row"];
type Part = DB["public"]["Tables"]["parts"]["Row"];
type PartStock = DB["public"]["Tables"]["part_stock"]["Row"];

export type PartReadinessLine = {
  partName: string;
  partNumber: string | null;
  qtyRequired: number;
  isRequired: boolean;
  /** null when no catalog part could be matched to this line. */
  matchedPartId: string | null;
  /** null when unmatched; otherwise on-hand minus reserved, summed across locations. */
  qtyAvailable: number | null;
  status: "ready" | "short" | "unmatched";
};

/**
 * For a set of menu repair items, resolve each item's required-parts list
 * against the shop's part catalog and current stock, so the appointment
 * preparation projection can flag jobs that are ready to pull parts for vs.
 * ones that will need ordering. This never reserves or moves stock — it is
 * a read-only readiness snapshot.
 */
export async function buildPartsReadinessForMenuRepairItems(input: {
  admin: ReturnType<typeof createAdminSupabase>;
  shopId: string;
  menuRepairItemIds: string[];
}): Promise<Map<string, PartReadinessLine[]>> {
  const { admin, shopId, menuRepairItemIds } = input;
  const uniqueItemIds = [...new Set(menuRepairItemIds.filter(Boolean))];
  if (uniqueItemIds.length === 0) return new Map();

  const requiredParts = await loadRowsForIdChunks<MenuRepairItemPart>(
    uniqueItemIds,
    (ids, from, to) =>
      admin
        .from("menu_repair_item_parts")
        .select("*")
        .eq("shop_id", shopId)
        .in("menu_repair_item_id", ids)
        .order("id", { ascending: true })
        .range(from, to),
  );

  if (requiredParts.length === 0) return new Map();

  const rawPartNumbers = [
    ...new Set(
      requiredParts
        .map((row) => row.part_number?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  const candidateParts: Part[] = [];
  if (rawPartNumbers.length > 0) {
    const [byPartNumber, bySku] = await Promise.all([
      admin
        .from("parts")
        .select("*")
        .eq("shop_id", shopId)
        .in("part_number", rawPartNumbers),
      admin.from("parts").select("*").eq("shop_id", shopId).in("sku", rawPartNumbers),
    ]);
    for (const row of byPartNumber.data ?? []) candidateParts.push(row as Part);
    for (const row of bySku.data ?? []) candidateParts.push(row as Part);
  }

  const partsByNormalizedNumber = new Map<string, Part>();
  for (const part of candidateParts) {
    for (const raw of [part.part_number, part.sku]) {
      const normalizedKey = normalizePartNumber(raw);
      if (normalizedKey && !partsByNormalizedNumber.has(normalizedKey)) {
        partsByNormalizedNumber.set(normalizedKey, part);
      }
    }
  }

  const matchedPartIds = [...new Set(candidateParts.map((part) => part.id))];
  const stockRows =
    matchedPartIds.length > 0
      ? await loadRowsForIdChunks<PartStock>(matchedPartIds, (ids, from, to) =>
          admin
            .from("part_stock")
            .select("*")
            .in("part_id", ids)
            .order("id", { ascending: true })
            .range(from, to),
        )
      : [];

  const availableByPartId = new Map<string, number>();
  for (const row of stockRows) {
    const available = Number(row.qty_on_hand ?? 0) - Number(row.qty_reserved ?? 0);
    availableByPartId.set(
      row.part_id,
      (availableByPartId.get(row.part_id) ?? 0) + available,
    );
  }

  const linesByMenuRepairItemId = new Map<string, PartReadinessLine[]>();
  for (const row of requiredParts) {
    const normalizedKey = normalizePartNumber(row.part_number);
    const matchedPart = normalizedKey
      ? partsByNormalizedNumber.get(normalizedKey)
      : undefined;
    const qtyAvailable = matchedPart
      ? availableByPartId.get(matchedPart.id) ?? 0
      : null;
    const qtyRequired = Math.max(1, Number(row.qty ?? 1));

    const status: PartReadinessLine["status"] = !matchedPart
      ? "unmatched"
      : qtyAvailable !== null && qtyAvailable >= qtyRequired
        ? "ready"
        : "short";

    const line: PartReadinessLine = {
      partName: row.part_name,
      partNumber: row.part_number,
      qtyRequired,
      isRequired: row.is_required,
      matchedPartId: matchedPart?.id ?? null,
      qtyAvailable,
      status,
    };

    const existing = linesByMenuRepairItemId.get(row.menu_repair_item_id) ?? [];
    existing.push(line);
    linesByMenuRepairItemId.set(row.menu_repair_item_id, existing);
  }

  return linesByMenuRepairItemId;
}
