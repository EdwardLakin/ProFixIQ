import type { Database } from "@shared/types/types/supabase";

type DB = Database;

export type VendorWorkspaceSupplier = Pick<
  DB["public"]["Tables"]["suppliers"]["Row"],
  "id" | "name" | "account_no" | "email" | "phone" | "notes" | "is_active"
>;

export type VendorWorkspacePart = Pick<
  DB["public"]["Tables"]["parts"]["Row"],
  "id" | "supplier" | "part_number" | "sku"
>;

export type VendorWorkspacePurchaseOrder = Pick<
  DB["public"]["Tables"]["purchase_orders"]["Row"],
  "id" | "supplier_id" | "status" | "created_at"
>;

export type VendorWorkspacePurchaseOrderLine = Pick<
  DB["public"]["Tables"]["purchase_order_lines"]["Row"],
  "po_id" | "part_id"
>;

export type VendorWorkspaceRequestItem = Pick<
  DB["public"]["Tables"]["part_request_items"]["Row"],
  "po_id" | "qty_approved" | "qty_received" | "vendor" | "vendor_id"
>;

export type VendorWorkspaceDirectLink = {
  supplier_id: string | null;
  part_id: string | null;
};

export type VendorOperationalState =
  | "Receiving"
  | "On order"
  | "Needs setup"
  | "Active"
  | "No activity"
  | "Inactive";

export type VendorDirectoryItem = {
  supplier: VendorWorkspaceSupplier;
  catalogPartCount: number;
  purchasedPartCount: number;
  legacyMatchedPartCount: number;
  openPoCount: number;
  pendingReceivingCount: number;
  lastActivityAt: string | null;
  state: VendorOperationalState;
  issues: string[];
};

export type VendorWorkspaceSummary = {
  totalVendors: number;
  vendorsNeedingSetup: number;
  openPurchaseOrders: number;
  pendingReceiving: number;
  catalogLinkedParts: number;
  legacyUnlinkedParts: number;
  partsWithoutVendorReference: number;
  duplicateVendorCandidates: number;
  openPoWithoutVendorRecord: number;
  requestRowsWithoutVendorRecord: number;
};

export const OPEN_PO_STATUSES = [
  "draft",
  "open",
  "sent",
  "ordered",
  "partially_received",
  "receiving",
] as const;

export function normalizeVendorName(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[\s\-_.]+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

export function hasVendorValue(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function laterTimestamp(current: string | undefined, candidate: string | null): string | undefined {
  if (!candidate) return current;
  if (!current) return candidate;
  return new Date(candidate).getTime() > new Date(current).getTime() ? candidate : current;
}

function isOpenPurchaseOrder(status: string | null): boolean {
  return OPEN_PO_STATUSES.includes(
    String(status ?? "").toLowerCase() as (typeof OPEN_PO_STATUSES)[number],
  );
}

export function buildVendorWorkspace(input: {
  suppliers: VendorWorkspaceSupplier[];
  parts: VendorWorkspacePart[];
  purchaseOrders: VendorWorkspacePurchaseOrder[];
  purchaseOrderLines: VendorWorkspacePurchaseOrderLine[];
  requestItems: VendorWorkspaceRequestItem[];
  barcodeLinks: VendorWorkspaceDirectLink[];
  vendorPartNumberLinks: VendorWorkspaceDirectLink[];
}): {
  directory: VendorDirectoryItem[];
  summary: VendorWorkspaceSummary;
} {
  const supplierById = new Map(input.suppliers.map((supplier) => [supplier.id, supplier]));
  const supplierIdsByNormalizedName = new Map<string, string[]>();
  const duplicateBuckets = new Map<string, VendorWorkspaceSupplier[]>();

  for (const supplier of input.suppliers) {
    const key = normalizeVendorName(supplier.name);
    if (!key) continue;
    const supplierIds = supplierIdsByNormalizedName.get(key) ?? [];
    supplierIds.push(supplier.id);
    supplierIdsByNormalizedName.set(key, supplierIds);
    const bucket = duplicateBuckets.get(key) ?? [];
    bucket.push(supplier);
    duplicateBuckets.set(key, bucket);
  }

  const catalogPartsBySupplier = new Map<string, Set<string>>();
  const catalogLinkedPartIds = new Set<string>();
  for (const link of [...input.vendorPartNumberLinks, ...input.barcodeLinks]) {
    const supplierId = String(link.supplier_id ?? "");
    const partId = String(link.part_id ?? "");
    if (!supplierId || !partId || !supplierById.has(supplierId)) continue;
    const linkedParts = catalogPartsBySupplier.get(supplierId) ?? new Set<string>();
    linkedParts.add(partId);
    catalogPartsBySupplier.set(supplierId, linkedParts);
    catalogLinkedPartIds.add(partId);
  }

  const purchaseOrderById = new Map(input.purchaseOrders.map((po) => [po.id, po]));
  const purchasedPartsBySupplier = new Map<string, Set<string>>();
  const openPoCountBySupplier = new Map<string, number>();
  const lastActivityBySupplier = new Map<string, string>();

  for (const po of input.purchaseOrders) {
    const supplierId = po.supplier_id;
    if (!supplierId || !supplierById.has(supplierId)) continue;
    if (isOpenPurchaseOrder(po.status)) {
      openPoCountBySupplier.set(supplierId, (openPoCountBySupplier.get(supplierId) ?? 0) + 1);
    }
    const latest = laterTimestamp(lastActivityBySupplier.get(supplierId), po.created_at);
    if (latest) lastActivityBySupplier.set(supplierId, latest);
  }

  for (const line of input.purchaseOrderLines) {
    const po = purchaseOrderById.get(line.po_id);
    const supplierId = po?.supplier_id ?? null;
    if (!supplierId || !line.part_id || !supplierById.has(supplierId)) continue;
    const linkedParts = purchasedPartsBySupplier.get(supplierId) ?? new Set<string>();
    linkedParts.add(line.part_id);
    purchasedPartsBySupplier.set(supplierId, linkedParts);
  }

  const pendingReceivingBySupplier = new Map<string, number>();
  for (const item of input.requestItems) {
    if (Number(item.qty_approved ?? 0) <= Number(item.qty_received ?? 0)) continue;
    const poSupplierId = item.po_id
      ? purchaseOrderById.get(item.po_id)?.supplier_id ?? null
      : null;
    const supplierId = item.vendor_id ?? poSupplierId;
    if (!supplierId || !supplierById.has(supplierId)) continue;
    pendingReceivingBySupplier.set(
      supplierId,
      (pendingReceivingBySupplier.get(supplierId) ?? 0) + 1,
    );
  }

  const legacyPartsBySupplier = new Map<string, Set<string>>();
  for (const part of input.parts) {
    if (!hasVendorValue(part.supplier) || catalogLinkedPartIds.has(part.id)) continue;
    const matchingSupplierIds =
      supplierIdsByNormalizedName.get(normalizeVendorName(part.supplier)) ?? [];
    if (matchingSupplierIds.length !== 1) continue;
    const supplierId = matchingSupplierIds[0];
    const linkedParts = legacyPartsBySupplier.get(supplierId) ?? new Set<string>();
    linkedParts.add(part.id);
    legacyPartsBySupplier.set(supplierId, linkedParts);
  }

  const directory = input.suppliers.map((supplier): VendorDirectoryItem => {
    const catalogPartCount = catalogPartsBySupplier.get(supplier.id)?.size ?? 0;
    const purchasedPartCount = purchasedPartsBySupplier.get(supplier.id)?.size ?? 0;
    const legacyMatchedPartCount = legacyPartsBySupplier.get(supplier.id)?.size ?? 0;
    const openPoCount = openPoCountBySupplier.get(supplier.id) ?? 0;
    const pendingReceivingCount = pendingReceivingBySupplier.get(supplier.id) ?? 0;
    const missingContact = !hasVendorValue(supplier.email) && !hasVendorValue(supplier.phone);
    const missingAccount = !hasVendorValue(supplier.account_no);
    const issues: string[] = [];

    if (missingContact) issues.push("Add an email or phone number");
    if (missingAccount) issues.push("Add an account number or vendor code");
    if ((duplicateBuckets.get(normalizeVendorName(supplier.name))?.length ?? 0) > 1) {
      issues.push("Possible duplicate vendor record");
    }
    if (legacyMatchedPartCount > 0) {
      issues.push(
        `${legacyMatchedPartCount.toLocaleString()} inventory ${
          legacyMatchedPartCount === 1 ? "part uses" : "parts use"
        } this vendor name without a catalog link`,
      );
    }

    let state: VendorOperationalState;
    if (!supplier.is_active) state = "Inactive";
    else if (pendingReceivingCount > 0) state = "Receiving";
    else if (openPoCount > 0) state = "On order";
    else if (missingContact || missingAccount) state = "Needs setup";
    else if (catalogPartCount > 0 || purchasedPartCount > 0 || legacyMatchedPartCount > 0) {
      state = "Active";
    } else state = "No activity";

    return {
      supplier,
      catalogPartCount,
      purchasedPartCount,
      legacyMatchedPartCount,
      openPoCount,
      pendingReceivingCount,
      lastActivityAt: lastActivityBySupplier.get(supplier.id) ?? null,
      state,
      issues,
    };
  });

  const duplicateVendorCandidates = Array.from(duplicateBuckets.values()).reduce(
    (total, bucket) => total + (bucket.length > 1 ? bucket.length : 0),
    0,
  );
  const openPurchaseOrders = input.purchaseOrders.filter((po) =>
    isOpenPurchaseOrder(po.status),
  );

  return {
    directory,
    summary: {
      totalVendors: input.suppliers.length,
      vendorsNeedingSetup: input.suppliers.filter(
        (supplier) =>
          (!hasVendorValue(supplier.email) && !hasVendorValue(supplier.phone)) ||
          !hasVendorValue(supplier.account_no),
      ).length,
      openPurchaseOrders: openPurchaseOrders.length,
      pendingReceiving: input.requestItems.filter(
        (item) => Number(item.qty_approved ?? 0) > Number(item.qty_received ?? 0),
      ).length,
      catalogLinkedParts: catalogLinkedPartIds.size,
      legacyUnlinkedParts: input.parts.filter(
        (part) => hasVendorValue(part.supplier) && !catalogLinkedPartIds.has(part.id),
      ).length,
      partsWithoutVendorReference: input.parts.filter(
        (part) => !hasVendorValue(part.supplier) && !catalogLinkedPartIds.has(part.id),
      ).length,
      duplicateVendorCandidates,
      openPoWithoutVendorRecord: openPurchaseOrders.filter(
        (po) => !po.supplier_id || !supplierById.has(po.supplier_id),
      ).length,
      requestRowsWithoutVendorRecord: input.requestItems.filter((item) => {
        const poSupplierId = item.po_id
          ? purchaseOrderById.get(item.po_id)?.supplier_id ?? null
          : null;
        return (
          hasVendorValue(item.vendor) &&
          !item.vendor_id &&
          (!poSupplierId || !supplierById.has(poSupplierId))
        );
      }).length,
    },
  };
}
