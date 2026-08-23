import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("PFX-004 assignment surface regressions", () => {
  it("keeps create-job payloads unassigned unless a technician was explicit", () => {
    const create = read("features/work-orders/app/work-orders/create/page.tsx");
    const newLine = read("features/work-orders/components/NewWorkOrderLineForm.tsx");
    expect(create).toContain("assigned_tech_id: null");
    expect(newLine).toContain("assigned_tech_id: null");
  });

  it("labels the single-value controls as primary and exposes explicit clear", () => {
    const card = read("features/work-orders/components/JobCard.tsx");
    const modal = read(
      "features/work-orders/components/workorders/FocusedJobModal.tsx",
    );
    expect(card).toContain('aria-label="Primary technician"');
    expect(card).toContain("Unassigned (clear all)");
    expect(modal).toContain('aria-label="Primary technician"');
    expect(modal).toContain("Unassigned (clear all)");
    expect(
      read("features/work-orders/mobile/MobileWorkOrderLines.tsx"),
    ).toContain("expectedUpdatedAt");
  });

  it("uses the shared contract for Mobile queue filtering and realtime refresh", () => {
    const queue = read(
      "features/mobile/work-orders/MobileWorkOrderQueue.tsx",
    );
    expect(queue).toContain("resolveTechnicianAssignmentContract");
    expect(queue).toContain('.from("work_order_line_technicians")');
    expect(queue).toContain("resolveCanonicalStaffProfile");
    expect(queue).toContain("technicianIds.includes(me.id)");
    expect(queue).toContain('table: "work_order_line_technicians"');

    const desktopQueue = read("app/tech/queue/page.tsx");
    expect(desktopQueue).toContain("resolveCanonicalStaffProfile");
    expect(desktopQueue).toContain("resolveTechnicianAssignmentContract");
    expect(desktopQueue).toContain("assignment.technicianIds.includes(prof.id)");
  });

  it("builds the work-order sidebar from line assignments, including unavailable profiles", () => {
    const assignables = read("app/api/assignables/route.ts");
    expect(assignables).toContain("resolveTechnicianAssignmentContract");
    expect(assignables).toContain(
      '.select("id, assigned_tech_id, assigned_to")',
    );
    expect(assignables).toContain('full_name: "Unavailable technician"');
    expect(assignables).not.toContain('.select("id, technician_id")');
  });

  it("routes bulk writes through the atomic RPC rather than direct table updates", () => {
    const route = read("app/api/work-orders/assign-all/route.ts");
    expect(route).toContain(
      '"assign_work_order_primary_technician_bulk_atomic"',
    );
    expect(route).not.toContain('.from("work_order_lines")');
    expect(route).not.toContain('.from("work_order_line_technicians")');

    const selfClaim = read("features/work-orders/lib/getNextJob.ts");
    expect(selfClaim).toContain(
      '"assign_work_order_line_technician_atomic"',
    );
    expect(selfClaim).not.toContain(".update({ assigned_tech_id");
    expect(selfClaim).not.toContain("fallback: pick");

    const assistant = read(
      "features/shop-assistant/server/tools/domains/workforce.ts",
    );
    expect(assistant).toContain("resolveTechnicianAssignmentContract");
    expect(assistant).toContain('.from("work_order_line_technicians")');
    expect(assistant).toContain("bridgeIdsByLine.get(line.id)");

    const notifications = read(
      "features/agent/server/syncAssistantNotifications.ts",
    );
    expect(notifications).toContain('.from("work_order_line_technicians")');
    expect(notifications).toContain("supportingAssignments");
  });
});
