import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const detail = readFileSync("app/work-orders/[id]/Client.tsx", "utf8");
const focusedJob = readFileSync(
  "features/work-orders/components/workorders/FocusedJobModal.tsx",
  "utf8",
);
const jobCard = readFileSync(
  "features/work-orders/components/JobCard.tsx",
  "utf8",
);

describe("desktop work-order cockpit", () => {
  it("uses stable navigator, workspace, command-center, and activity surfaces", () => {
    expect(detail).toContain('display="navigator"');
    expect(detail).toContain('variant="cockpit"');
    expect(detail).toContain("Work order activity");
    expect(detail).toContain("primaryTechSnapshot={panelPrimaryTech}");
    expect(detail).toContain("isPunchedInSnapshot={panelLineIsPunchedIn}");
    expect(detail).not.toContain("<PageShell");

    expect(focusedJob).toContain('data-work-order-cockpit="true"');
    expect(focusedJob).toContain("Command center");
    expect(focusedJob).toContain('role="tablist"');
    expect(focusedJob).toContain('activeWorkspaceTab === "overview"');
    expect(focusedJob).toContain("resolveOperationalLineStatusLabel");
    expect(jobCard).toContain('display === "navigator"');
  });

  it("keeps canonical work-order actions behind their existing handlers", () => {
    expect(detail).toContain("assignWorkOrderLineTechnician");
    expect(detail).toContain("requestAllPartsForLine");
    expect(detail).toContain("openInspectionForLine");
    expect(detail).toContain("<DeleteOrVoidLineModal");
    expect(detail).toContain("<PartsDrawer");
    expect(detail).toContain('variant="modal"');

    expect(focusedJob).toContain('runJobPunchTransition(workOrderLineId, "pause"');
    expect(focusedJob).toContain('runJobPunchTransition(workOrderLineId, "resume"');
    expect(focusedJob).toContain('runJobPunchTransition(line.id, "finish"');
    expect(focusedJob).toContain("<PartsRequestModal");
    expect(focusedJob).toContain("<PhotoCaptureModal");
    expect(focusedJob).toContain("<NewChatModal");
    expect(focusedJob).toContain("<AIAssistantModal");
    expect(focusedJob).toContain("<VehicleHistoryModal");
  });
});
