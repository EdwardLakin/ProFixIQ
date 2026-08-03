import { describe, expect, it } from "vitest";
import {
  buildVendorWorkspace,
  normalizeVendorName,
  type VendorWorkspaceSupplier,
} from "./vendorWorkspace";

function supplier(
  overrides: Partial<VendorWorkspaceSupplier> &
    Pick<VendorWorkspaceSupplier, "id" | "name">,
): VendorWorkspaceSupplier {
  return {
    account_no: "ACCOUNT-1",
    email: "parts@example.com",
    phone: null,
    notes: null,
    is_active: true,
    ...overrides,
  };
}

describe("normalizeVendorName", () => {
  it("normalizes punctuation and spacing for deterministic comparisons", () => {
    expect(normalizeVendorName("  North-Star_Parts Ltd. ")).toBe(
      "north star parts ltd",
    );
  });
});

describe("buildVendorWorkspace", () => {
  it("counts canonical catalog links from vendor part numbers and barcodes", () => {
    const result = buildVendorWorkspace({
      suppliers: [supplier({ id: "vendor-1", name: "North Star Parts" })],
      parts: [
        { id: "part-1", supplier: null, part_number: "A1", sku: null },
        { id: "part-2", supplier: null, part_number: "A2", sku: null },
      ],
      purchaseOrders: [],
      purchaseOrderLines: [],
      requestItems: [],
      barcodeLinks: [{ supplier_id: "vendor-1", part_id: "part-2" }],
      vendorPartNumberLinks: [{ supplier_id: "vendor-1", part_id: "part-1" }],
    });

    expect(result.summary.catalogLinkedParts).toBe(2);
    expect(result.summary.partsWithoutVendorReference).toBe(0);
    expect(result.directory[0]?.catalogPartCount).toBe(2);
  });

  it("keeps purchase history separate from catalog links", () => {
    const result = buildVendorWorkspace({
      suppliers: [supplier({ id: "vendor-1", name: "North Star Parts" })],
      parts: [{ id: "part-1", supplier: null, part_number: "A1", sku: null }],
      purchaseOrders: [
        {
          id: "po-1",
          supplier_id: "vendor-1",
          status: "ordered",
          created_at: "2026-07-23T12:00:00.000Z",
        },
      ],
      purchaseOrderLines: [{ po_id: "po-1", part_id: "part-1" }],
      requestItems: [],
      barcodeLinks: [],
      vendorPartNumberLinks: [],
    });

    expect(result.directory[0]?.purchasedPartCount).toBe(1);
    expect(result.directory[0]?.catalogPartCount).toBe(0);
    expect(result.directory[0]?.state).toBe("On order");
  });

  it("assigns pending receiving directly from vendor_id when no PO is attached", () => {
    const result = buildVendorWorkspace({
      suppliers: [supplier({ id: "vendor-1", name: "North Star Parts" })],
      parts: [],
      purchaseOrders: [],
      purchaseOrderLines: [],
      requestItems: [
        {
          po_id: null,
          qty_approved: 2,
          qty_received: 1,
          vendor: "North Star Parts",
          vendor_id: "vendor-1",
        },
      ],
      barcodeLinks: [],
      vendorPartNumberLinks: [],
    });

    expect(result.summary.pendingReceiving).toBe(1);
    expect(result.directory[0]?.pendingReceivingCount).toBe(1);
    expect(result.directory[0]?.state).toBe("Receiving");
  });

  it("reports legacy vendor text without treating it as a canonical catalog link", () => {
    const result = buildVendorWorkspace({
      suppliers: [supplier({ id: "vendor-1", name: "North-Star Parts" })],
      parts: [
        {
          id: "part-1",
          supplier: "north star parts",
          part_number: "A1",
          sku: null,
        },
      ],
      purchaseOrders: [],
      purchaseOrderLines: [],
      requestItems: [],
      barcodeLinks: [],
      vendorPartNumberLinks: [],
    });

    expect(result.summary.legacyUnlinkedParts).toBe(1);
    expect(result.summary.catalogLinkedParts).toBe(0);
    expect(result.directory[0]?.legacyMatchedPartCount).toBe(1);
    expect(result.directory[0]?.issues[0]).toContain("without a catalog link");
  });

  it("does not guess a legacy match when duplicate normalized vendor names exist", () => {
    const result = buildVendorWorkspace({
      suppliers: [
        supplier({ id: "vendor-1", name: "North Star Parts" }),
        supplier({ id: "vendor-2", name: "North-Star Parts" }),
      ],
      parts: [
        {
          id: "part-1",
          supplier: "North Star Parts",
          part_number: "A1",
          sku: null,
        },
      ],
      purchaseOrders: [],
      purchaseOrderLines: [],
      requestItems: [],
      barcodeLinks: [],
      vendorPartNumberLinks: [],
    });

    expect(result.summary.duplicateVendorCandidates).toBe(2);
    expect(
      result.directory.every((row) => row.legacyMatchedPartCount === 0),
    ).toBe(true);
    expect(result.directory.every((row) => row.setup.possibleDuplicate)).toBe(
      true,
    );
  });

  it("exposes structured profile flags for directory filtering and actions", () => {
    const result = buildVendorWorkspace({
      suppliers: [
        supplier({
          id: "vendor-1",
          name: "North Star Parts",
          account_no: null,
          email: null,
          phone: null,
        }),
      ],
      parts: [
        {
          id: "part-1",
          supplier: "North Star Parts",
          part_number: "A1",
          sku: null,
        },
      ],
      purchaseOrders: [],
      purchaseOrderLines: [],
      requestItems: [],
      barcodeLinks: [],
      vendorPartNumberLinks: [],
    });

    expect(result.directory[0]?.setup).toEqual({
      missingContact: true,
      missingAccount: true,
      possibleDuplicate: false,
      hasLegacyVendorText: true,
    });
  });
});
