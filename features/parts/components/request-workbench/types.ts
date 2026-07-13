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
  suggestedSellPrice?: number | null;
  status?: WorkbenchStatus | null;
  partId?: string | null;
  poId?: string | null;
  qtyReceived?: number | null;
  qtyApproved?: number | null;
  addedToWorkOrder?: boolean;
  packageCommitWarning?: string | null;
  insights?: SmartInsight[];
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
