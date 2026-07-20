import { describe, expect, it } from "vitest";
import { filterInvoicePartAllocations } from "./filterInvoicePartAllocations";

describe("filterInvoicePartAllocations", () => {
  const allocation = {
    id: "allocation-1",
    part_id: "oil-1",
    source_request_item_id: "request-item-1",
  };
  const stagedPart = {
    id: "staged-1",
    part_id: "oil-1",
    source_parts_request_item_id: "request-item-1",
  };

  it("keeps an allocated part when its staged row resolved to zero quantity", () => {
    expect(
      filterInvoicePartAllocations({
        allocations: [allocation],
        stagedParts: [stagedPart],
        displayedStagedPartIds: new Set(),
      }),
    ).toEqual([allocation]);
  });

  it("deduplicates an allocation only when the staged row is billable", () => {
    expect(
      filterInvoicePartAllocations({
        allocations: [allocation],
        stagedParts: [stagedPart],
        displayedStagedPartIds: new Set([stagedPart.id]),
      }),
    ).toEqual([]);
  });
});
