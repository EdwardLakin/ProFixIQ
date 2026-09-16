import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "features/inspections/components/InspectionModal.tsx",
  "utf8",
);

describe("work-order inspection workspace transition", () => {
  it("reuses the work-order repair-lines footprint instead of navigating away", () => {
    expect(source).toContain('[data-workspace-module="repairLines"]');
    expect(source).toContain('data-inspection-workspace-transition="true"');
    expect(source).toContain("createPortal");
    expect(source).toContain("Back to job");
  });

  it("keeps the canonical inspection host and modal fallback", () => {
    expect(source).toContain("<InspectionHost");
    expect(source).toContain("params={derived.params}");
    expect(source).toContain("<Dialog");
  });

  it("does not introduce inspection persistence or schema logic", () => {
    expect(source).not.toContain("supabase.from(");
    expect(source).not.toContain("/api/work-orders/import-from-inspection");
    expect(source).not.toContain("create table");
    expect(source).not.toContain("alter table");
  });
});
