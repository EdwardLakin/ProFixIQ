import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const picker = readFileSync(
  "features/parts/components/PartPicker.tsx",
  "utf8",
);
const usePartButton = readFileSync(
  "features/work-orders/components/UsePartButton.tsx",
  "utf8",
);
const pickerRoute = readFileSync("app/api/parts/picker/route.ts", "utf8");

describe("technician part picker access", () => {
  it("loads inventory through a server-scoped route", () => {
    expect(picker).toContain("fetch(`/api/parts/picker?");
    expect(picker).toContain('params.set("workOrderLineId", workOrderLineId)');
    expect(picker).not.toContain('.from("parts")');
    expect(usePartButton).toContain(
      "workOrderLineId={workOrderLineId}",
    );
  });

  it("limits mechanic inventory to an assigned work-order line", () => {
    expect(pickerRoute).toContain('"mechanic"');
    expect(pickerRoute).toContain(
      'access.canonicalRole === "mechanic"',
    );
    expect(pickerRoute).toContain("line.assigned_tech_id");
    expect(pickerRoute).toContain("line.assigned_to");
    expect(pickerRoute).toContain(
      '.from("work_order_line_technicians")',
    );
    expect(pickerRoute).toContain(
      '.eq("technician_id", input.technicianId)',
    );
    expect(pickerRoute).toContain(
      "This inventory picker is limited to your assigned jobs.",
    );
  });

  it("keeps every inventory query scoped to the authenticated shop", () => {
    expect(pickerRoute).toContain("createAdminSupabase()");
    expect(pickerRoute).toContain(
      '.eq("shop_id", access.profile.shop_id)',
    );
    expect(pickerRoute).toContain('"Cache-Control": "private, no-store"');
  });
});
