import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type WorkOrderPart = DB["public"]["Tables"]["work_order_parts"]["Row"];

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

type AllocationLink = {
  source_request_item_id?: string | null;
  work_order_part_id?: string | null;
  location_id?: string | null;
  qty?: number | null;
  quantity?: number | null;
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
  return part.description_snapshot?.trim() || part.parts?.name?.trim() || null;
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

function isLinkedAllocation(
  allocation: AllocationLink,
  part: { id?: string | null; source_parts_request_item_id?: string | null },
): boolean {
  return Boolean(
    (allocation.work_order_part_id && allocation.work_order_part_id === part.id) ||
      (allocation.source_request_item_id &&
        allocation.source_request_item_id === part.source_parts_request_item_id),
  );
}

export function summarizeCanonicalPartAllocations(
  part: { id?: string | null; source_parts_request_item_id?: string | null },
  allocations: AllocationLink[],
): { allocatedQuantity: number; locations: string[] } {
  const linked = allocations.filter((allocation) => isLinkedAllocation(allocation, part));
  const allocatedQuantity = linked.reduce(
    (sum, allocation) =>
      sum + (toNumber(allocation.qty) ?? toNumber(allocation.quantity) ?? 0),
    0,
  );
  const locations = Array.from(
    new Set(
      linked
        .map((allocation) => allocation.location_id?.trim() || null)
        .filter((location): location is string => Boolean(location)),
    ),
  );
  return { allocatedQuantity, locations };
}

export function filterAllocationsNotBackedByCanonicalParts<T extends AllocationLink>(
  allocations: T[],
  canonicalParts: Array<{ id?: string | null; source_parts_request_item_id?: string | null }>,
): T[] {
  return allocations.filter(
    (allocation) =>
      !canonicalParts.some((part) => isLinkedAllocation(allocation, part)),
  );
}
