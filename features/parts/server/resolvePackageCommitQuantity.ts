import type { Database } from "@shared/types/types/supabase";

type PartRequestItem = Database["public"]["Tables"]["part_request_items"]["Row"];

type CommitQuantitySource = Pick<PartRequestItem, "qty_requested" | "qty">;

export function resolvePackageCommitQuantity(item: CommitQuantitySource): number {
  const requested = typeof item.qty_requested === "number" ? item.qty_requested : Number(item.qty_requested);
  if (Number.isFinite(requested) && requested > 0) return requested;
  const legacy = typeof item.qty === "number" ? item.qty : Number(item.qty);
  if (Number.isFinite(legacy) && legacy > 0) return legacy;
  return 0;
}
