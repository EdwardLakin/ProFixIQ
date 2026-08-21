import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  getWorkOrderJobWorkspaceTabs,
  WORK_ORDER_WORKSPACE_MODULES,
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
      "panelInspectionTemplateId &&",
    );
    expect(workOrderClient).toContain(
      "? () => openInspectionForLine(panelLine)",
    );
    expect(workOrderClient).toContain("? () => setPartsLineId(panelLineId)");
    expect(focusedJob).toContain("onClick={() => void onOpenInspection()}");
    expect(focusedJob).toContain("onClick={onOpenPartsInventory}");
  });
});
