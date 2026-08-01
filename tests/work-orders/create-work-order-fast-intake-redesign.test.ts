import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const createPage = readFileSync(
  "features/work-orders/app/work-orders/create/page.tsx",
  "utf8",
);
const customerVehicleForm = readFileSync(
  "features/inspections/components/inspection/CustomerVehicleForm.tsx",
  "utf8",
);

describe("create work order fast-intake redesign", () => {
  it("keeps the existing direct submit contract without wizard gates", () => {
    expect(createPage).toContain("<form onSubmit={handleSubmit}");
    expect(createPage).toContain('type="submit"');
    expect(createPage).toContain("Create work order");
    expect(createPage).not.toContain("Next step");
    expect(createPage).not.toContain("currentStep");
  });

  it("keeps customer, vehicle, and VIN selection on the fast path", () => {
    expect(createPage).toContain("<CustomerVehicleForm");
    expect(createPage).toContain("<VinCaptureModal");
    expect(createPage).toContain("Scan VIN");
    expect(createPage).toContain(
      "onCustomerSelected: (id: string) => setCustomerId(id)",
    );
    expect(createPage).toContain(
      "onVehicleSelected: (id: string) => setVehicleId(id)",
    );
  });

  it("uses existing defaults and hides non-blocking visit fields by default", () => {
    expect(createPage).toContain('useTabState<number>("priority", 3)');
    expect(createPage).toContain('useTabState<boolean>("is_waiter", false)');
    expect(createPage).toContain("Visit settings");
    expect(createPage).toContain("Attachments &amp; internal notes");
    expect(createPage).not.toContain("<details open");
  });

  it("keeps only primary customer and vehicle fields expanded", () => {
    expect(customerVehicleForm).toContain("Address details");
    expect(customerVehicleForm).toContain("More vehicle details");
    expect(customerVehicleForm).toContain("Start typing in any primary field");
    expect(customerVehicleForm).toContain("Search by unit or plate");
    expect(customerVehicleForm).not.toContain("Shop&nbsp;");
  });

  it("preserves touch-friendly persistent actions", () => {
    expect(createPage).toContain(
      "sticky bottom-[calc(0.75rem+var(--safe-bottom))]",
    );
    expect(createPage).toContain("min-h-11 w-full");
    expect(createPage).toContain("min-h-10 items-center");
  });
});
