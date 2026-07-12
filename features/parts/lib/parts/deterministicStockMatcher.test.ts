import { describe, expect, it } from "vitest";
import { detectPartDescriptionConflict } from "./deterministicStockMatcher";

describe("detectPartDescriptionConflict", () => {
  it("does not treat blank requested part number or generic-to-specific oil-filter selection as a mismatch", () => {
    expect(detectPartDescriptionConflict({
      requestedDescription: "Oil filter",
      requestedPartNumber: "",
      matchedPart: { name: "ACDelco Oil Filter", part_number: "OIL-FILTER-5" },
    })).toBeNull();
  });

  it("does not let selected metadata overwrite requested intent before mismatch evaluation", () => {
    expect(detectPartDescriptionConflict({
      requestedDescription: "Oil filter",
      requestedPartNumber: "OIL-FILTER-5",
      matchedPart: { name: "ACDelco Oil Filter", part_number: "OIL-FILTER-5" },
    })).toBeNull();
  });

  it("warns on explicit conflicting requested part numbers", () => {
    expect(detectPartDescriptionConflict({
      requestedDescription: "Oil filter",
      requestedPartNumber: "BRAKE-123",
      matchedPart: { name: "ACDelco Oil Filter", part_number: "OIL-FILTER-5" },
    })?.message).toContain("Requested part # BRAKE-123");
  });

  it("warns on materially different part categories", () => {
    expect(detectPartDescriptionConflict({
      requestedDescription: "Oil filter",
      matchedPart: { name: "5W30 synthetic motor oil", sku: "OIL-5W30", category: "Fluid" },
    })).not.toBeNull();
  });
});
