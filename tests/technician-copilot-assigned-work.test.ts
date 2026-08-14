import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { readCanonicalWorkOrderConcern } from "@/features/copilot/technician/server/assignedWork";

const assignedWorkSource = readFileSync(
  "features/copilot/technician/server/assignedWork.ts",
  "utf8",
);

describe("Technician CoPilot assigned-work context", () => {
  it("reads the canonical structured intake concern", () => {
    expect(
      readCanonicalWorkOrderConcern({
        concern: {
          primary_text: " Rear driveline vibration ",
          additional_text: "Customer hears a clunk on takeoff",
        },
      }),
    ).toBe("Rear driveline vibration | Customer hears a clunk on takeoff");
  });

  it("returns no concern for missing or empty intake data", () => {
    expect(readCanonicalWorkOrderConcern(null)).toBeNull();
    expect(
      readCanonicalWorkOrderConcern({
        concern: { primary_text: "  ", additional_text: null },
      }),
    ).toBeNull();
  });

  it("queries only canonical work-order columns", () => {
    expect(assignedWorkSource).toContain(
      "id,custom_id,status,notes,intake_json,vehicle_year,vehicle_make,vehicle_model,vehicle_vin,vehicle_unit_number,updated_at",
    );
    expect(assignedWorkSource).not.toContain("customer_concern");
  });

  it("derives candidates from canonical technician assignment paths before loading work orders", () => {
    const directAssignmentIndex = assignedWorkSource.indexOf(
      '.from("work_order_lines")',
    );
    const sharedAssignmentIndex = assignedWorkSource.indexOf(
      '.from("work_order_line_technicians")',
    );
    const workOrderIndex = assignedWorkSource.indexOf('.from("work_orders")');

    expect(directAssignmentIndex).toBeGreaterThanOrEqual(0);
    expect(sharedAssignmentIndex).toBeGreaterThanOrEqual(0);
    expect(workOrderIndex).toBeGreaterThan(directAssignmentIndex);
    expect(workOrderIndex).toBeGreaterThan(sharedAssignmentIndex);
    expect(assignedWorkSource).toContain("assigned_tech_id.eq.");
    expect(assignedWorkSource).toContain("assigned_to.eq.");
    expect(assignedWorkSource).toContain('.eq("shop_id", input.shopId)');
    expect(assignedWorkSource).toContain('.eq("line_type", "job")');
  });

  it("exposes only assigned line IDs as startable CoPilot lines", () => {
    expect(assignedWorkSource).toContain(
      "if (assignedLineIds.has(line.id)) value.assignedIds.push(line.id);",
    );
    expect(assignedWorkSource).toContain(
      ".filter((candidate) => candidate.lineIds.length > 0)",
    );
  });
});
