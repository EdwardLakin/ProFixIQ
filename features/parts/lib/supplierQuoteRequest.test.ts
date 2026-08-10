import { describe, expect, it } from "vitest";

import {
  buildSupplierQuoteDraft,
  supplierQuoteContactHref,
} from "./supplierQuoteRequest";

describe("supplier quote request", () => {
  it("uses the work order number as the primary supplier reference", () => {
    const draft = buildSupplierQuoteDraft({
      workOrderNumber: "EL00118",
      supplierName: "AutoValue",
      items: [
        {
          description: "Pinion bearing",
          qty: 2,
          requestedPartNumber: "BRG-118",
          requestedManufacturer: "Timken",
        },
        { description: "Crush sleeve", qty: 1 },
      ],
    });

    expect(draft.subject).toBe("Quote request - EL00118");
    expect(draft.message).toContain("work order EL00118");
    expect(draft.message).toContain(
      "- 2 x Pinion bearing (Part # BRG-118 | Timken)",
    );
    expect(draft.message).toContain("- 1 x Crush sleeve");
  });

  it("builds email and phone handoff links", () => {
    expect(
      supplierQuoteContactHref({
        channel: "email",
        email: "parts@example.com",
        subject: "Quote request - EL00118",
        message: "Please quote these parts.",
      }),
    ).toContain("mailto:parts@example.com?subject=Quote%20request%20-%20EL00118");

    expect(
      supplierQuoteContactHref({
        channel: "phone",
        phone: "+1 (780) 555-0100",
        subject: "",
        message: "",
      }),
    ).toBe("tel:+17805550100");
  });
});
