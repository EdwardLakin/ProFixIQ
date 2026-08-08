import { describe, expect, it } from "vitest";

import { purchaseOrderIdentity } from "./purchaseOrderIdentity";

describe("purchase order identity", () => {
  it("leads with the work order and keeps the PO number secondary", () => {
    expect(
      purchaseOrderIdentity({
        id: "4d291185-082e-4e8d-aea4-5ff5bdc981bd",
        poNumber: "PO-0042",
        workOrderNumber: "EL00118",
      }),
    ).toEqual({ primary: "EL00118", secondary: "PO-0042" });
  });

  it("labels a genuinely unanchored inventory PO as a stock purchase", () => {
    expect(
      purchaseOrderIdentity({
        id: "4d291185-082e-4e8d-aea4-5ff5bdc981bd",
      }),
    ).toEqual({ primary: "Stock purchase", secondary: "PO-4D291185" });
  });
});
