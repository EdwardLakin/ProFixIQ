import { buildWorkbenchInsights } from "./buildWorkbenchInsights";
import type {
  PartsRequestWorkbenchItem,
  PartsRequestWorkbenchModel,
  DraftPurchaseOrderPrompt,
  SupplierQuoteWorkbenchBatch,
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

function stripMaintenancePartPlaceholder(value: unknown): string {
  const raw = text(value);
  return raw.replace(/^parts\s+to\s+quote\s*[—–-]\s*/i, "").trim();
}

function maintenanceServiceFromNotes(value: unknown): string {
  const notes = text(value);
  if (!notes) return "";

  const canonical = notes.match(
    /(?:^|\n)service\s+to\s+quote:\s*([^\n]+)/i,
  )?.[1]?.trim();
  if (canonical) return canonical;

  return (
    notes.match(
      /(?:^|\n)maintenance\s+parts\s+quote\s+required:\s*([^\n(]+?)(?:\s*\([^\n]*\))?(?:\n|$)/i,
    )?.[1]?.trim() ?? ""
  );
}

function deriveJobContext(input: {
  explicit?: string | null;
  request: AnyRecord;
  items: AnyRecord[];
}): string | null {
  const preApprovalQuoteRequest =
    Boolean(nullableText(input.request.quote_line_id)) &&
    !input.items.some((item) => Boolean(nullableText(item.work_order_line_id)));

  const serviceFromNotes = maintenanceServiceFromNotes(input.request.notes);
  const firstItemDescription = text(input.items[0]?.description);
  const serviceFromItem = firstItemDescription
    ? stripMaintenancePartPlaceholder(firstItemDescription) || firstItemDescription
    : "";

  // A pre-approval quote request does not yet have a canonical work-order line.
  // The page may still supply its historical single-line fallback as explicit
  // context; preferring that would make every quote request display the same
  // unrelated work-order-line description. Use the quote's own service context
  // until materialization creates a real work_order_line_id.
  if (preApprovalQuoteRequest) {
    if (serviceFromNotes) return serviceFromNotes;
    if (serviceFromItem) return serviceFromItem;
  }

  const explicit = text(input.explicit);
  if (explicit) return explicit;

  const legacyJob = text(input.request.job_id);
  if (legacyJob) return legacyJob;

  if (serviceFromNotes) return serviceFromNotes;
  if (serviceFromItem) return serviceFromItem;

  return null;
}

export function mapRequestItemToWorkbenchItem(input: {
  item: AnyRecord;
  hideDescription?: boolean;
  hasStockSuggestion?: boolean;
  availableStock?: number | null;
  supplierSuggestionCount?: number;
  conflictWarning?: string | null;
  addedToWorkOrder?: boolean;
  packageCommitWarning?: string | null;
  partsById?: Record<string, AnyRecord>;
}): PartsRequestWorkbenchItem {
  const item = input.item;
  const qty = num(item.ui_qty ?? item.qty ?? item.qty_requested, 1);
  const sellPriceRaw = item.ui_price ?? item.quoted_price ?? item.unit_price;
  const sellPrice = sellPriceRaw == null || sellPriceRaw === "" ? null : num(sellPriceRaw, 0);
  const qtyReceived = num(item.qty_received, 0);
  const qtyApproved = num(item.qty_approved ?? item.qty, qty);
  const selectedPartId = nullableText(item.ui_part_id ?? item.part_id);
  const selectedPart = selectedPartId
    ? input.partsById?.[selectedPartId] ?? null
    : null;

  return {
    id: text(item.id),
    description: input.hideDescription ? "" : text(item.description),
    requestedPartNumber: nullableText(item.requested_part_number),
    requestedManufacturer: nullableText(item.requested_manufacturer),
    selectedPartNumber: nullableText(selectedPart?.part_number ?? selectedPart?.sku),
    selectedManufacturer: nullableText(selectedPart?.manufacturer ?? selectedPart?.supplier),
    qty,
    sellPrice,
    unitCost:
      item.unit_cost == null || item.unit_cost === ""
        ? null
        : num(item.unit_cost, 0),
    suggestedSellPrice: selectedPart?.price == null && selectedPart?.default_price == null ? null : num(selectedPart?.price ?? selectedPart?.default_price, 0),
    status: nullableText(item.status),
    partId: selectedPartId,
    poId: nullableText(item.ui_po_id ?? item.po_id),
    supplierQuoteStatus: nullableText(item.supplier_quote_status),
    supplierQuoteRequestedAt: nullableText(item.supplier_quote_requested_at),
    supplierId: nullableText(item.vendor_id),
    latestSupplierQuoteRequestId: nullableText(
      item.latest_supplier_quote_request_id,
    ),
    qtyReceived,
    qtyApproved,
    addedToWorkOrder: input.addedToWorkOrder === true,
    packageCommitWarning: input.packageCommitWarning ?? null,
    insights: buildWorkbenchInsights({
      hasSuggestedMatch: false,
      noStock: Boolean(nullableText(item.ui_part_id ?? item.part_id) && input.availableStock != null && num(input.availableStock, 0) <= 0),
      possibleMismatch: input.conflictWarning,
      onPo: Boolean(nullableText(item.ui_po_id ?? item.po_id)),
      partial: qtyReceived > 0 && qtyReceived < qtyApproved,
      noPreferredSupplier: false,
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
  requestLabel?: string | null;
  defaultLocationId?: string | null;
  defaultSupplierId?: string | null;
  stockSuggestionCountByItemId?: Record<string, number>;
  availableStockByItemId?: Record<string, number>;
  supplierSuggestionCountByItemId?: Record<string, number>;
  conflictWarningByItemId?: Record<string, string>;
  addedToWorkOrderByItemId?: Record<string, boolean>;
  packageCommitWarningByItemId?: Record<string, string>;
  supplierQuoteRequests?: SupplierQuoteWorkbenchBatch[];
  draftPurchaseOrders?: DraftPurchaseOrderPrompt[];
}): PartsRequestWorkbenchModel {
  const requestId = text(input.request.id);
  const requestLabel = text(
    input.requestLabel,
    text(input.request.custom_id, requestId ? requestId.slice(0, 8) : "Request"),
  );
  const jobContext = deriveJobContext({
    explicit: input.jobContext,
    request: input.request,
    items: input.items,
  });
  const preApprovalQuoteRequest =
    Boolean(nullableText(input.request.quote_line_id)) &&
    !input.items.some((item) => Boolean(nullableText(item.work_order_line_id)));

  return {
    requestId,
    requestLabel,
    status: nullableText(input.request.status),
    workOrderId: input.workOrderId ?? nullableText(input.request.work_order_id),
    workOrderCustomId: input.workOrderCustomId ?? null,
    jobContext,
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
        sellPrice: part.price == null && part.default_price == null ? null : num(part.price ?? part.default_price, 0),
        onHandQty: Object.prototype.hasOwnProperty.call(input.stockAvailableByPartId ?? {}, partId)
          ? input.stockAvailableByPartId?.[partId]
          : null,
      };
    }),
    packageCommittedCount: Object.values(input.addedToWorkOrderByItemId ?? {}).filter(Boolean).length,
    supplierQuoteRequests: input.supplierQuoteRequests ?? [],
    draftPurchaseOrders: input.draftPurchaseOrders ?? [],
    items: input.items.map((item) => {
      const itemId = text(item.id);
      const itemDescription = stripMaintenancePartPlaceholder(item.description);
      const hideDescription =
        preApprovalQuoteRequest &&
        Boolean(jobContext) &&
        Boolean(itemDescription) &&
        itemDescription.toLowerCase() === jobContext?.toLowerCase();

      return mapRequestItemToWorkbenchItem({
        item,
        hideDescription,
        hasStockSuggestion: (input.stockSuggestionCountByItemId?.[itemId] ?? 0) > 0,
        availableStock: input.availableStockByItemId?.[itemId] ?? null,
        supplierSuggestionCount: input.supplierSuggestionCountByItemId?.[itemId] ?? 0,
        conflictWarning: input.conflictWarningByItemId?.[itemId] ?? null,
        addedToWorkOrder: input.addedToWorkOrderByItemId?.[itemId] ?? false,
        packageCommitWarning: input.packageCommitWarningByItemId?.[itemId] ?? null,
        partsById: Object.fromEntries((input.parts ?? []).map((part) => [text(part.id), part])),
      });
    }),
  };
}
