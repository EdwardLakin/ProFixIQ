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
const sessionRouteSource = readFileSync(
  "app/api/copilot/technician/session/route.ts",
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

  it("uses the canonical ProFixIQ line-status alias contract for actionable work", () => {
    expect(assignedWorkSource).toContain("getWorkOrderLineStatusDbFilter");
    expect(assignedWorkSource).toContain("ACTIVE_CANONICAL_LINE_STATUSES");
    expect(assignedWorkSource).toContain("ACTIVE_LINE_DB_STATUSES");
    expect(assignedWorkSource).toContain('"pending"');
    expect(assignedWorkSource).toContain('"approved"');
    expect(assignedWorkSource).toContain('"waiting_parts"');
    expect(assignedWorkSource).toContain(
      '.in("status", ACTIVE_LINE_DB_STATUSES)',
    );
  });

  it("filters shared assignments to active lines in PostgREST before applying the cap", () => {
    expect(assignedWorkSource).toContain(
      "work_order_lines!inner(id,work_order_id)",
    );
    expect(assignedWorkSource).toContain(
      '.eq("work_order_lines.shop_id", input.shopId)',
    );
    expect(assignedWorkSource).toContain(
      '.eq("work_order_lines.line_type", "job")',
    );
    expect(assignedWorkSource).toContain(
      '.in("work_order_lines.status", ACTIVE_LINE_DB_STATUSES)',
    );
    expect(assignedWorkSource).toContain("PRESESSION_ASSIGNMENT_LIMIT = 250");
    expect(assignedWorkSource).toContain(".limit(PRESESSION_ASSIGNMENT_LIMIT)");
    expect(assignedWorkSource).not.toContain("SHARED_ASSIGNMENT_PAGE_SIZE");
  });

  it("uses a stable composite ordering for shared assignment identity", () => {
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
    expect(chatSource).toContain(
      "let envelope = await read(input.identity, input.sessionId)",
    );
    expect(chatSource).toContain("if (envelope.session) {");
    expect(chatSource).toContain(
      "loadTechnicianWorkCandidateForWorkOrder({",
    );
    expect(chatSource).toContain(
      "} else {\n    candidates = await listTechnicianWorkCandidates(workScope);",
    );
  });

  it("uses the same targeted loader for the session snapshot route", () => {
    expect(sessionRouteSource).toContain(
      'import { loadTechnicianWorkCandidateForWorkOrder } from "@/features/copilot/technician/server/assignedWork"',
    );
    expect(sessionRouteSource).toContain(
      "const workOrder = envelope.session",
    );
    expect(sessionRouteSource).toContain(
      "? await loadTechnicianWorkCandidateForWorkOrder({",
    );
    expect(sessionRouteSource).not.toContain("listTechnicianWorkCandidates");
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
