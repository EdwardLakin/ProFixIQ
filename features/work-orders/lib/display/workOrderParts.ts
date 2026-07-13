import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type WorkOrderPart = DB["public"]["Tables"]["work_order_parts"]["Row"];
type WorkOrderPartAllocation = DB["public"]["Tables"]["work_order_part_allocations"]["Row"];

export type CanonicalWorkOrderPart = WorkOrderPart & {
  id: string;
  source_parts_request_item_id?: string | null;
  part_id: string | null;
  description_snapshot?: string | null;
  part_number_snapshot?: string | null;
  manufacturer_snapshot?: string | null;
  quantity_requested?: number | null;
  quantity: number;
  unit_sell_price_snapshot?: number | null;
  unit_price: number | null;
  total_price: number | null;
  lifecycle_status?: string | null;
  is_active?: boolean | null;
  parts?: { name?: string | null; part_number?: string | null; sku?: string | null; manufacturer?: string | null; supplier?: string | null } | null;
};

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function getCanonicalPartQuantity(part: Pick<CanonicalWorkOrderPart, "quantity" | "quantity_requested">): number {
  return toNumber(part.quantity_requested) ?? toNumber(part.quantity) ?? 0;
}

export function getCanonicalPartUnitPrice(part: Pick<CanonicalWorkOrderPart, "unit_sell_price_snapshot" | "unit_price">): number {
  return toNumber(part.unit_sell_price_snapshot) ?? toNumber(part.unit_price) ?? 0;
}

export function getCanonicalPartTotal(part: Pick<CanonicalWorkOrderPart, "quantity" | "quantity_requested" | "unit_sell_price_snapshot" | "unit_price" | "total_price">): number {
  return toNumber(part.total_price) ?? getCanonicalPartQuantity(part) * getCanonicalPartUnitPrice(part);
}

export function getCanonicalPartDescription(part: Pick<CanonicalWorkOrderPart, "description_snapshot" | "parts">): string | null {
  const snapshot = part.description_snapshot?.trim();
  if (snapshot) return snapshot;
  const catalogName = part.parts?.name?.trim();
  return catalogName || null;
}

export function getCanonicalPartNumber(part: Pick<CanonicalWorkOrderPart, "part_number_snapshot" | "parts">): string | null {
  return part.part_number_snapshot?.trim() || part.parts?.part_number?.trim() || part.parts?.sku?.trim() || null;
}

export function getCanonicalPartManufacturer(part: Pick<CanonicalWorkOrderPart, "manufacturer_snapshot" | "parts">): string | null {
  return part.manufacturer_snapshot?.trim() || part.parts?.manufacturer?.trim() || part.parts?.supplier?.trim() || null;
}

export function activeCanonicalWorkOrderParts(parts: CanonicalWorkOrderPart[]): CanonicalWorkOrderPart[] {
  return parts.filter((part) => part.is_active !== false);
}

export function filterAllocationsNotBackedByCanonicalParts<T extends Pick<WorkOrderPartAllocation, "source_request_item_id">>(
  allocations: T[],
  canonicalParts: Array<{ source_parts_request_item_id?: string | null }>,
): T[] {
  const canonicalSourceItemIds = new Set(
    canonicalParts
      .map((part) => part.source_parts_request_item_id ?? null)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );
  if (canonicalSourceItemIds.size === 0) return allocations;
  return allocations.filter((allocation) => {
    const sourceItemId = allocation.source_request_item_id ?? null;
    return !sourceItemId || !canonicalSourceItemIds.has(sourceItemId);
  });
}
