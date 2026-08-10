import { describe, expect, it } from "vitest";

import { invoiceDisplayIdentity } from "./invoiceDisplayIdentity";

describe("invoiceDisplayIdentity", () => {
  it("keeps the work order number primary and invoice number secondary", () => {
    expect(
      invoiceDisplayIdentity({
        workOrderNumber: " EL00118 ",
        invoiceNumber: " INV-0042 ",
        workOrderId: "work-order-id",
      }),
    ).toEqual({
      primary: "EL00118",
      secondary: "Invoice INV-0042",
    });
  });

  it("uses a readable work order fallback without exposing an invoice database id", () => {
    expect(
      invoiceDisplayIdentity({
        workOrderId: "12345678-abcd-4000-8000-123456789abc",
      }),
    ).toEqual({
      primary: "Work order 12345678",
      secondary: "Invoice number pending",
    });
  });

  it("labels an unnumbered draft invoice beneath the work order", () => {
    expect(
      invoiceDisplayIdentity({
        workOrderNumber: "EL00118",
        draft: true,
      }),
    ).toEqual({
      primary: "EL00118",
      secondary: "Draft invoice",
    });
  });
});
