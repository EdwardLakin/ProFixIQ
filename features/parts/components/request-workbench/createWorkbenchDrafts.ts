import type { CreateInventoryItemInput } from "./CreateInventoryItemModal";
import type { OrderPartInput } from "./OrderPartModal";
import type { PartsRequestWorkbenchItem } from "./types";

export function createInventoryDraftFromItem(
  item: PartsRequestWorkbenchItem | null,
  defaultSupplierId = "",
): CreateInventoryItemInput {
  return {
    name: item?.description ?? "",
    partNumber: item?.requestedPartNumber ?? "",
    manufacturer: item?.requestedManufacturer ?? "",
    sku: "",
    category: "",
    cost: "",
    sellPrice: item?.sellPrice == null ? "" : String(item.sellPrice),
    defaultSupplierId,
    initialQty: "",
  };
}

export function createOrderDraftFromItem(
  item: PartsRequestWorkbenchItem | null,
  defaultSupplierId = "",
): OrderPartInput {
  return {
    supplierId: defaultSupplierId,
    poMode: item?.poId ? "existing" : "new",
    existingPoId: item?.poId ?? "",
    qty: String(Math.max(1, item?.qty ?? 1)),
    unitCost: "",
    expectedDate: "",
  };
}
