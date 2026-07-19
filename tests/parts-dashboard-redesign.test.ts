import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("app/parts/page.tsx", "utf8");

describe("Parts dashboard redesign", () => {
  it("separates work orders, requests, and items instead of presenting one ambiguous count", () => {
    expect(source).toContain('label="Active work orders"');
    expect(source).toContain('label="Open requests"');
    expect(source).toContain('label="Open items"');
    expect(source).toContain("new Set(");
    expect(source).toContain("activeRequests.length");
  });

  it("uses the agreed four-stage active parts flow and separate completed history", () => {
    expect(source).toContain('label: "Needs Quote"');
    expect(source).toContain('label: "Awaiting Approval"');
    expect(source).toContain('label: "Order & Receive"');
    expect(source).toContain('label: "Ready for Tech"');
    expect(source).toContain(
      "Completed requests are kept out of active counts.",
    );
  });

  it("uses the shared lifecycle derivation and paged totals", () => {
    expect(source).toContain("function approvedReceivingQty");
    expect(source).toContain("toPartsRequestStage");
    expect(source).toContain("earliestPartsRequestStage");
    expect(source).toContain("stagesByWorkOrder");
    expect(source).toContain(".range(offset, offset + pageSize - 1)");
  });

  it("keeps the dashboard on canonical parts routes", () => {
    expect(source).toContain('href="/parts/requests"');
    expect(source).toContain('href="/parts/receiving"');
    expect(source).toContain('href="/parts/inventory"');
    expect(source).toContain('href="/parts/movements"');
  });
});
