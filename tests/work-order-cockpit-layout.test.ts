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
const partsDrawer = readFileSync(
  "features/parts/components/PartsDrawer.tsx",
  "utf8",
);
const partPicker = readFileSync(
  "features/parts/components/PartPicker.tsx",
  "utf8",
);
const pwaRuntime = readFileSync(
  "features/shared/components/pwa/PwaRuntime.tsx",
  "utf8",
);

describe("desktop work-order cockpit", () => {
  it("uses stable navigator, workspace, command-center, and activity surfaces", () => {
    expect(detail).toContain('display="navigator"');
    expect(detail).toContain('variant="cockpit"');
    expect(detail).toContain("Work order activity");
    expect(detail).toContain("primaryTechSnapshot={panelPrimaryTech}");
    expect(detail).toContain("isPunchedInSnapshot={panelLineIsPunchedIn}");
    expect(detail).toContain("onAssignTechnician={assignLineTechnician}");
    expect(detail).not.toContain("<PageShell");

    expect(focusedJob).toContain('data-work-order-cockpit="true"');
    expect(focusedJob).toContain('data-work-order-scroll-owner="page"');
    expect(focusedJob).toContain("Command center");
    expect(focusedJob).toContain('aria-label="Primary technician"');
    expect(focusedJob).toContain('role="tablist"');
    expect(focusedJob).toContain('activeWorkspaceTab === "overview"');
    expect(focusedJob).toContain("resolveOperationalLineStatusLabel");
    expect(focusedJob).toContain('"Add hold"');
    expect(focusedJob).not.toContain('"Add blocker"');
    expect(jobCard).toContain('display === "navigator"');
    expect(focusedJob).toContain('id="work-order-runtime-status"');
    expect(pwaRuntime).toContain("createPortal(runtimeStatusControl, runtimeStatusTarget)");
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

  it("keeps parts workflows in the shared top-level modal layer", () => {
    expect(partsDrawer).toContain("<ModalShell");
    expect(partsDrawer).toContain('title="Parts Drawer"');
    expect(partsDrawer).toContain('variant="inline"');
    expect(partPicker).toContain("<ModalShell");
    expect(partPicker).toContain('title="Part Picker"');
    expect(partsDrawer).not.toContain('className="fixed inset-0 z-[510]"');
  });
});
