import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  canOpenWorkOrderInspectionModule,
  getWorkOrderJobWorkspaceTabs,
  WORK_ORDER_WORKSPACE_MODULES,
  workOrderPartsRefreshEventName,
} from "@/features/work-orders/workspace/workOrderWorkspace";

const workOrderClient = readFileSync("app/work-orders/[id]/Client.tsx", "utf8");
const focusedJob = readFileSync(
  "features/work-orders/components/workorders/FocusedJobModal.tsx",
  "utf8",
);

describe("Work Order Workspace Inspection and Parts composition", () => {
  it("adds Inspection only when the existing inspection action is available", () => {
    const withoutInspection = getWorkOrderJobWorkspaceTabs({
      inspectionAvailable: false,
    });
    const withInspection = getWorkOrderJobWorkspaceTabs({
      inspectionAvailable: true,
    });

    expect(withoutInspection.map((tab) => tab.id)).toEqual([
      "overview",
      "story",
      "parts",
      "evidence",
      "details",
    ]);
    expect(withInspection.map((tab) => tab.id)).toEqual([
      "overview",
      "story",
      "inspection",
      "parts",
      "evidence",
      "details",
    ]);
    expect(withInspection.find((tab) => tab.id === "inspection")?.module).toBe(
      "inspection",
    );
  });

  it("uses the attached template and capability regardless of repair-line type", () => {
    expect(
      canOpenWorkOrderInspectionModule({
        inspectionTemplateId: "template-1",
        canRunInspections: true,
      }),
    ).toBe(true);
    expect(
      canOpenWorkOrderInspectionModule({
        inspectionTemplateId: null,
        canRunInspections: true,
      }),
    ).toBe(false);
    expect(
      canOpenWorkOrderInspectionModule({
        inspectionTemplateId: "template-1",
        canRunInspections: false,
      }),
    ).toBe(false);
    expect(workOrderClient).not.toContain(
      'panelLine?.job_type === "inspection"',
    );
  });

  it("applies the inspection capability gate to navigator actions", () => {
    expect(workOrderClient).toContain(
      "inspectionTemplateId: navigatorInspectionTemplateId",
    );
    expect(workOrderClient).not.toContain(
      'ln.job_type === "inspection"\n                            ? () => void openInspectionForLine(ln)',
    );
  });

  it("keeps Inspection and Parts on distinct canonical module boundaries", () => {
    expect(WORK_ORDER_WORKSPACE_MODULES.inspection.anchorId).not.toBe(
      WORK_ORDER_WORKSPACE_MODULES.parts.anchorId,
    );
    expect(focusedJob).toContain('<WorkOrderWorkspaceModule module="inspection">');
    expect(focusedJob).toContain('<WorkOrderWorkspaceModule module="parts">');
    expect(focusedJob).toContain("data-workspace-module-action={tab.module}");
  });

  it("delegates to the existing inspection and inventory handlers", () => {
    expect(workOrderClient).toContain(
      "inspectionTemplateId: panelInspectionTemplateId",
    );
    expect(workOrderClient).toContain(
      "? () => openInspectionForLine(panelLine)",
    );
    expect(workOrderClient).toContain("? () => setPartsLineId(panelLineId)");
    expect(focusedJob).toContain("onClick={() => void onOpenInspection()}");
    expect(focusedJob).toContain("onClick={onOpenPartsInventory}");
  });

  it("refreshes the focused Parts module after the inventory drawer closes", () => {
    expect(workOrderPartsRefreshEventName("line-1")).toBe(
      "work-order-workspace:parts-refresh:line-1",
    );
    expect(workOrderClient).toContain(
      "notifyWorkOrderPartsRefresh(partsLineId)",
    );
    expect(focusedJob).toContain(
      "useWorkOrderPartsRefresh(workOrderLineId, loadAllocations)",
    );
  });
});
