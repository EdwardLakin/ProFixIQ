export type FieldTruck = {
  id: string;
  name: string;
  unitNumber: string | null;
  stockLocationId: string | null;
  primaryUserId: string | null;
  active: boolean;
};

export type FieldInventoryVisit = {
  id: string;
  status: string;
  mode: string;
  workOrderId: string | null;
  serviceVehicleId: string | null;
  assignedTechnicianId: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
};

export type FieldInventoryIdentity = {
  id: string;
  provider: string;
  externalId: string | null;
  supplierId: string | null;
  supplierSku: string | null;
  barcode: string | null;
  partNumber: string | null;
  manufacturer: string | null;
  unitOfMeasure: string | null;
  packageQuantity: number;
};

export type FieldTruckInventoryItem = {
  partId: string;
  name: string;
  description: string | null;
  partNumber: string | null;
  sku: string | null;
  manufacturer: string | null;
  supplier: string | null;
  onHand: number;
  reserved: number;
  available: number;
  barcodes: string[];
  identities: FieldInventoryIdentity[];
};

export type FieldPartLocation = {
  locationId: string;
  code: string | null;
  name: string | null;
  onHand: number;
  reserved: number;
  available: number;
  serviceVehicleId: string | null;
  serviceVehicleName: string | null;
};

export type FieldCatalogPart = Omit<
  FieldTruckInventoryItem,
  "onHand" | "reserved" | "available" | "identities"
> & {
  locations: FieldPartLocation[];
};

export type FieldWorkOrderLine = {
  id: string;
  lineNumber: number | null;
  description: string;
  status: string | null;
  approvalState: string | null;
  assignedTechnicianId: string | null;
};

const ACTIONABLE_FIELD_LINE_STATUSES = new Set([
  "awaiting",
  "assigned",
  "queued",
  "approved",
  "in_progress",
  "on_hold",
  "paused",
  "waiting_parts",
]);

export function isActionableFieldWorkOrderLine(line: FieldWorkOrderLine): boolean {
  return (
    String(line.approvalState ?? "").trim().toLowerCase() === "approved" &&
    ACTIONABLE_FIELD_LINE_STATUSES.has(
      String(line.status ?? "").trim().toLowerCase(),
    )
  );
}

export type FieldOpenReceipt = {
  purchaseOrderId: string;
  purchaseOrderNumber: string;
  purchaseOrderStatus: string | null;
  purchaseOrderLineId: string;
  partId: string | null;
  requiresCanonicalIdentity: boolean;
  description: string;
  partNumber: string | null;
  sku: string | null;
  orderedQuantity: number;
  receivedQuantity: number;
  remainingQuantity: number;
  targetLocationId: string | null;
  truckTargeted: boolean;
};

export type FieldStockLocation = {
  id: string;
  code: string | null;
  name: string | null;
  serviceVehicleId: string | null;
  serviceVehicleName: string | null;
  serviceVehicleUnitNumber: string | null;
};

export type FieldRecentPartUse = {
  stockMoveId: string;
  workOrderPartId: string;
  workOrderLineId: string | null;
  partId: string;
  name: string;
  partNumber: string | null;
  quantity: number;
  createdAt: string;
  returnedQuantity: number;
};

export type FieldTruckInventoryMovement = {
  id: string;
  partId: string;
  partName: string;
  partNumber: string | null;
  quantity: number;
  direction: "in" | "out";
  reason: string;
  createdAt: string;
  actorName: string | null;
  sourceLocationName: string | null;
  destinationLocationName: string | null;
  purchaseOrderNumber: string | null;
  workOrderNumber: string | null;
};

export function aggregateRecentPartUses(
  uses: FieldRecentPartUse[],
): FieldRecentPartUse[] {
  const grouped = new Map<string, FieldRecentPartUse>();
  for (const use of uses) {
    const current = grouped.get(use.workOrderPartId);
    if (!current) {
      grouped.set(use.workOrderPartId, { ...use });
      continue;
    }
    current.quantity = numeric(current.quantity) + numeric(use.quantity);
    current.returnedQuantity = Math.max(
      numeric(current.returnedQuantity),
      numeric(use.returnedQuantity),
    );
    if (new Date(use.createdAt).getTime() > new Date(current.createdAt).getTime()) {
      current.stockMoveId = use.stockMoveId;
      current.createdAt = use.createdAt;
    }
  }
  return [...grouped.values()].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

export type FieldTruckInventorySnapshot = {
  generatedAt: string;
  actorProfileId: string;
  canManageParts: boolean;
  canConfigure: boolean;
  hasFieldAccess: boolean;
  visit: FieldInventoryVisit | null;
  trucks: FieldTruck[];
  truck: FieldTruck | null;
  workOrderLines: FieldWorkOrderLine[];
  items: FieldTruckInventoryItem[];
  catalog: FieldCatalogPart[];
  openReceipts: FieldOpenReceipt[];
  locations: FieldStockLocation[];
  recentUses: FieldRecentPartUse[];
  movements: FieldTruckInventoryMovement[];
};

export type FieldPartIdentityResult =
  | {
      ok: true;
      idempotent: boolean;
      found: false;
      created: false;
      requiresDetails: true;
      code: string | null;
      provider: string;
      externalId: string | null;
    }
  | {
      ok: true;
      idempotent: boolean;
      found?: true;
      created: boolean;
      partId: string;
      identityId: string | null;
      part: {
        id: string;
        name: string;
        partNumber: string | null;
        sku: string | null;
        manufacturer: string | null;
        cost: number | null;
        price: number | null;
      };
    };

export type FieldUseTruckPartPayload = {
  visitId: string;
  workOrderLineId: string;
  partId: string;
  quantity: number;
  operationKey: string;
  scannedCode?: string | null;
};

export type FieldReturnTruckPartPayload = {
  visitId: string;
  workOrderPartId: string;
  quantity: number;
  operationKey: string;
};

export function numeric(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
