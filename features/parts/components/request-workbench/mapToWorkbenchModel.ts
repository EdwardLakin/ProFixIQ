import { buildWorkbenchInsights } from "./buildWorkbenchInsights";
import type {
  PartsRequestWorkbenchItem,
  PartsRequestWorkbenchModel,
  WorkbenchOption,
} from "./types";

type AnyRecord = Record<string, unknown>;

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function num(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableText(value: unknown): string | null {
  const cleaned = text(value);
  return cleaned || null;
}

export function mapRequestItemToWorkbenchItem(input: {
  item: AnyRecord;
  hasStockSuggestion?: boolean;
  availableStock?: number | null;
  supplierSuggestionCount?: number;
  conflictWarning?: string | null;
}): PartsRequestWorkbenchItem {
  const item = input.item;
  const qty = num(item.ui_qty ?? item.qty ?? item.qty_requested, 1);
  const sellPriceRaw = item.ui_price ?? item.quoted_price ?? item.unit_price;
  const sellPrice = sellPriceRaw == null || sellPriceRaw === "" ? null : num(sellPriceRaw, 0);
  const qtyReceived = num(item.qty_received, 0);
  const qtyApproved = num(item.qty_approved ?? item.qty, qty);

  return {
    id: text(item.id),
    description: text(item.description, "Part"),
    requestedPartNumber: nullableText(item.requested_part_number),
    requestedManufacturer: nullableText(item.requested_manufacturer),
    qty,
    sellPrice,
    status: nullableText(item.status),
    partId: nullableText(item.ui_part_id ?? item.part_id),
    poId: nullableText(item.ui_po_id ?? item.po_id),
    qtyReceived,
    qtyApproved,
    insights: buildWorkbenchInsights({
      hasSuggestedMatch: input.hasStockSuggestion,
      noStock: Boolean(input.hasStockSuggestion && num(input.availableStock, 0) <= 0),
      possibleMismatch: input.conflictWarning,
      onPo: Boolean(nullableText(item.ui_po_id ?? item.po_id)),
      partial: qtyReceived > 0 && qtyReceived < qtyApproved,
      noPreferredSupplier: (input.supplierSuggestionCount ?? 0) === 0,
    }),
  };
}

export function mapRequestToWorkbenchModel(input: {
  request: AnyRecord;
  items: AnyRecord[];
  supplierOptions?: WorkbenchOption[];
  poOptions?: WorkbenchOption[];
  locationOptions?: WorkbenchOption[];
  parts?: AnyRecord[];
  stockAvailableByPartId?: Record<string, number>;
  workOrderId?: string | null;
  workOrderCustomId?: string | null;
  jobContext?: string | null;
  defaultLocationId?: string | null;
  defaultSupplierId?: string | null;
  stockSuggestionCountByItemId?: Record<string, number>;
  availableStockByItemId?: Record<string, number>;
  supplierSuggestionCountByItemId?: Record<string, number>;
  conflictWarningByItemId?: Record<string, string>;
}): PartsRequestWorkbenchModel {
  const requestId = text(input.request.id);
  const requestLabel = text(input.request.custom_id, requestId ? requestId.slice(0, 8) : "Request");

  return {
    requestId,
    requestLabel,
    status: nullableText(input.request.status),
    workOrderId: input.workOrderId ?? nullableText(input.request.work_order_id),
    workOrderCustomId: input.workOrderCustomId ?? null,
    jobContext: input.jobContext ?? nullableText(input.request.job_id),
    createdAt: nullableText(input.request.created_at),
    defaultSupplierId: input.defaultSupplierId ?? null,
    defaultLocationId: input.defaultLocationId ?? null,
    supplierOptions: input.supplierOptions ?? [],
    poOptions: input.poOptions ?? [],
    locationOptions: input.locationOptions ?? [],
    inventoryResults: (input.parts ?? []).map((part) => {
      const partId = text(part.id);
      return {
        value: partId,
        label: text(part.name, "Part"),
        sku: nullableText(part.sku),
        partNumber: nullableText(part.part_number),
        manufacturer: nullableText(part.manufacturer ?? part.supplier),
        onHandQty: input.stockAvailableByPartId?.[partId] ?? 0,
      };
    }),
    items: input.items.map((item) => {
      const itemId = text(item.id);
      return mapRequestItemToWorkbenchItem({
        item,
        hasStockSuggestion: (input.stockSuggestionCountByItemId?.[itemId] ?? 0) > 0,
        availableStock: input.availableStockByItemId?.[itemId] ?? null,
        supplierSuggestionCount: input.supplierSuggestionCountByItemId?.[itemId] ?? 0,
        conflictWarning: input.conflictWarningByItemId?.[itemId] ?? null,
      });
    }),
  };
}
