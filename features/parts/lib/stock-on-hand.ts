import type { Database } from "@shared/types/types/supabase";

type StockMoveQuantityRow = Pick<
  Database["public"]["Tables"]["stock_moves"]["Row"],
  "part_id" | "qty_change"
>;

type StockMoveQueryResult = {
  data: StockMoveQuantityRow[] | null;
  error: { message?: string } | null;
};

type SupabaseStockMoveClient = {
  from: (table: "stock_moves") => {
    select: (columns: "part_id, qty_change") => {
      eq: (column: "shop_id", value: string) => {
        in: (column: "part_id", values: string[]) => PromiseLike<StockMoveQueryResult>;
      };
    };
  };
};

export type StockOnHandByPartId = Record<string, number>;

export function sumStockMovesByPartId(
  moves: readonly Pick<StockMoveQuantityRow, "part_id" | "qty_change">[],
): StockOnHandByPartId {
  const totals: StockOnHandByPartId = {};

  for (const move of moves) {
    const partId = String(move.part_id ?? "").trim();
    if (!partId) continue;

    const delta = Number(move.qty_change);
    totals[partId] = (totals[partId] ?? 0) + (Number.isFinite(delta) ? delta : 0);
  }

  return totals;
}

export async function loadStockOnHandByPartId(
  supabase: SupabaseStockMoveClient,
  shopId: string,
  partIds: readonly string[],
): Promise<StockOnHandByPartId> {
  const uniquePartIds = Array.from(new Set(partIds.map((id) => String(id).trim()).filter(Boolean)));
  if (uniquePartIds.length === 0) return {};

  const { data, error } = await supabase
    .from("stock_moves")
    .select("part_id, qty_change")
    .eq("shop_id", shopId)
    .in("part_id", uniquePartIds);

  if (error) {
    throw new Error(error.message || "Unable to load stock moves for inventory on-hand totals.");
  }

  return sumStockMovesByPartId(data ?? []);
}

export function toStockSummaryRowsFromOnHand(
  stockOnHandByPartId: StockOnHandByPartId,
): Database["public"]["Views"]["part_stock_summary"]["Row"][] {
  return Object.entries(stockOnHandByPartId).map(([part_id, on_hand]) => ({
    category: null,
    move_count: null,
    name: null,
    on_hand,
    part_id,
    price: null,
    shop_id: null,
    sku: null,
  }));
}
