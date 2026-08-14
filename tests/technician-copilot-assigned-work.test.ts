import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { readCanonicalWorkOrderConcern } from "@/features/copilot/technician/server/assignedWork";

const assignedWorkSource = readFileSync(
  "features/copilot/technician/server/assignedWork.ts",
  "utf8",
);
const chatSource = readFileSync(
  "features/copilot/technician/server/chat.ts",
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

  it("derives candidates from canonical direct and shared technician assignment paths", () => {
    expect(assignedWorkSource).toContain("assigned_tech_id.eq.");
    expect(assignedWorkSource).toContain("assigned_to.eq.");
    expect(assignedWorkSource).toContain('.from("work_order_line_technicians")');
    expect(assignedWorkSource).toContain('.eq("shop_id", input.shopId)');
    expect(assignedWorkSource).toContain('.eq("line_type", "job")');
  });

  it("bounds pre-session discovery to operational assignments instead of scanning lifetime history", () => {
    expect(assignedWorkSource).toContain("ACTIVE_LINE_STATUSES");
    expect(assignedWorkSource).toContain("PRESESSION_ASSIGNMENT_LIMIT = 250");
    expect(assignedWorkSource).toContain('.order("updated_at", { ascending: false })');
    expect(assignedWorkSource).toContain('.order("assigned_at", { ascending: false })');
    expect(assignedWorkSource).toContain(".limit(PRESESSION_ASSIGNMENT_LIMIT)");
    expect(assignedWorkSource).toContain(".slice(0, 30)");
  });

  it("uses a unique composite ordering for shared assignment identity", () => {
    expect(assignedWorkSource).toContain(
      '.order("work_order_line_id", { ascending: false })',
    );
    expect(assignedWorkSource).toContain(
      '.order("technician_id", { ascending: false })',
    );
    expect(assignedWorkSource).toContain(
      '.order("technician_id", { ascending: true })',
    );
  });

  it("uses a bounded single-work-order loader after a Repair Session exists", () => {
    expect(assignedWorkSource).toContain(
      "export async function loadTechnicianWorkCandidateForWorkOrder",
    );
    expect(chatSource).toContain("let envelope = await read(input.identity, input.sessionId)");
    expect(chatSource).toContain("if (envelope.session) {");
    expect(chatSource).toContain("loadTechnicianWorkCandidateForWorkOrder({");
    expect(chatSource).toContain("} else {\n    candidates = await listTechnicianWorkCandidates(workScope);");
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
