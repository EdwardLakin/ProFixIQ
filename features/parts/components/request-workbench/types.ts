import type { ReactNode } from "react";

export type WorkbenchStatus =
  | "requested"
  | "quoted"
  | "ordered"
  | "partial"
  | "received"
  | "open"
  | string;

export type WorkbenchOption = {
  value: string;
  label: string;
};

export type SmartInsightKind =
  | "suggested_match"
  | "no_stock"
  | "possible_mismatch"
  | "on_po"
  | "partial"
  | "no_preferred_supplier";

export type SmartInsight = {
  id: string;
  kind: SmartInsightKind;
  label: string;
  detail?: ReactNode;
};

export type PartsRequestWorkbenchItem = {
  id: string;
  description: string;
  requestedPartNumber?: string | null;
  requestedManufacturer?: string | null;
  selectedPartNumber?: string | null;
  selectedManufacturer?: string | null;
  qty: number;
  sellPrice: number | null;
  unitCost?: number | null;
  suggestedSellPrice?: number | null;
  status?: WorkbenchStatus | null;
  partId?: string | null;
  poId?: string | null;
  supplierQuoteStatus?: "not_requested" | "requested" | "received" | "cancelled" | string | null;
  supplierQuoteRequestedAt?: string | null;
  supplierId?: string | null;
  latestSupplierQuoteRequestId?: string | null;
  qtyReceived?: number | null;
  qtyApproved?: number | null;
  addedToWorkOrder?: boolean;
  packageCommitWarning?: string | null;
  insights?: SmartInsight[];
};

export type SupplierQuoteChannel = "email" | "phone";

export type SupplierQuoteRequestInput = {
  supplierId: string;
  itemIds: string[];
  channel: SupplierQuoteChannel;
  idempotencyKey: string;
};

export type SupplierQuoteRequestResult = {
  quoteRequestId?: string | null;
  workOrderNumber: string;
  launchUrl: string | null;
  supplier: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
  };
  draft: {
    subject: string;
    message: string;
  };
};

export type SupplierQuoteResponseLineInput = {
  partRequestItemId: string;
  status: "quoted" | "unavailable";
  supplierPartNumber?: string | null;
  quotedUnitCost?: number | null;
  quotedSellPrice?: number | null;
  availability?: string | null;
  expectedAt?: string | null;
};

export type SupplierQuoteResponseInput = {
  quoteRequestId: string;
  items: SupplierQuoteResponseLineInput[];
  notes?: string | null;
  idempotencyKey: string;
};

export type SupplierQuoteResponseResult = {
  quoteRequestId: string;
  status: string;
};

export type SupplierQuoteWorkbenchBatch = {
  id: string;
  supplierId: string;
  supplierName: string;
  status: string;
  requestedAt?: string | null;
  respondedAt?: string | null;
  draftPoId?: string | null;
  poGenerationError?: string | null;
  itemIds: string[];
};

export type DraftPurchaseOrderPrompt = {
  id: string;
  poNumber?: string | null;
  status: string;
  supplierId: string;
  supplierName: string;
  supplierEmail?: string | null;
  supplierPhone?: string | null;
  supplierContactedAt?: string | null;
};

export type PurchaseOrderContactInput = {
  poId: string;
  channel: SupplierQuoteChannel;
  idempotencyKey: string;
};

export type PurchaseOrderContactResult = {
  poId: string;
  launchUrl: string | null;
  supplierName: string;
};

export type PartsRequestInventoryResult = WorkbenchOption & {
  sku?: string | null;
  partNumber?: string | null;
  manufacturer?: string | null;
  onHandQty?: number | null;
  sellPrice?: number | null;
};

export type PartsRequestWorkbenchModel = {
  requestId: string;
  requestLabel: string;
  status?: WorkbenchStatus | null;
  workOrderId?: string | null;
  workOrderCustomId?: string | null;
  jobContext?: string | null;
  createdBy?: string | null;
  createdAt?: string | null;
  defaultSupplierId?: string | null;
  supplierOptions: WorkbenchOption[];
  poOptions: WorkbenchOption[];
  locationOptions: WorkbenchOption[];
  inventoryResults?: PartsRequestInventoryResult[];
  defaultLocationId?: string | null;
  items: PartsRequestWorkbenchItem[];
  supplierQuoteRequests?: SupplierQuoteWorkbenchBatch[];
  draftPurchaseOrders?: DraftPurchaseOrderPrompt[];
  packageCommittedCount?: number;
};

export type SaveItemInput = {
  itemId: string;
  description: string;
  requestedPartNumber?: string | null;
  requestedManufacturer?: string | null;
  qty: number;
  sellPrice: number | null;
};

export type AttachInventoryInput = {
  itemId: string;
  partId: string;
  warningAccepted?: boolean;
};

export type ItemAction = {
  itemId: string;
};
