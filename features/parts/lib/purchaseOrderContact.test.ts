import { describe, expect, it } from "vitest";

import {
  buildPurchaseOrderContactDraft,
  purchaseOrderContactHref,
} from "./purchaseOrderContact";

describe("purchase order supplier contact", () => {
  it("uses the work order as the primary supplier reference", () => {
    const draft = buildPurchaseOrderContactDraft({
      workOrderNumber: "EL00118",
      poNumber: "PO-1234ABCD",
      supplierName: "AutoValue",
      lines: [{ description: "Pinion bearing", sku: "PB-18", qty: 2, unitCost: 44.5 }],
    });

    expect(draft.subject).toBe("Purchase order - EL00118");
    expect(draft.message).toContain("work order EL00118");
    expect(draft.message).toContain("PO reference: PO-1234ABCD");
    expect(draft.message).toContain("Pinion bearing | Qty 2 | Part # PB-18");
  });

  it("creates email and phone launch links", () => {
    expect(
      purchaseOrderContactHref({
        channel: "email",
        email: "parts@example.com",
        subject: "Purchase order - EL00118",
        message: "Please place this order.",
      }),
    ).toContain("mailto:parts%40example.com");
    expect(
      purchaseOrderContactHref({
        channel: "phone",
        phone: "+1 (780) 555-0101",
        subject: "",
        message: "",
      }),
    ).toBe("tel:+17805550101");
  });
});
