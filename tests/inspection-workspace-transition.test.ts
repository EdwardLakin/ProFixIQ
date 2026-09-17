import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const modalSource = readFileSync(
  "features/inspections/components/InspectionModal.tsx",
  "utf8",
);
const sessionSource = readFileSync(
  "features/inspections/hooks/useInspectionSession.ts",
  "utf8",
);
const bridgeSource = readFileSync(
  "features/inspections/workspace/inspectionWorkspaceBridge.ts",
  "utf8",
);

describe("work-order inspection workspace transition", () => {
  it("reuses the work-order repair-lines footprint instead of navigating away", () => {
    expect(modalSource).toContain('[data-workspace-module="repairLines"]');
    expect(modalSource).toContain('data-inspection-workspace-transition="true"');
    expect(modalSource).toContain("createPortal");
    expect(modalSource).toContain("Back to job");
  });

  it("renders the approved workspace shell around the canonical inspection host", () => {
    expect(modalSource).toContain("<InspectionWorkspaceShell");
    expect(modalSource).toContain("<InspectionHost");
    expect(modalSource).toContain("params={derived.params}");
    expect(modalSource).toContain("<Dialog");
  });

  it("mirrors canonical session state instead of creating a second inspection engine", () => {
    expect(sessionSource).toContain("publishInspectionWorkspaceState(session)");
    expect(sessionSource).toContain("subscribeInspectionWorkspaceSectionRequests");
    expect(modalSource).toContain("subscribeInspectionWorkspaceState");
    expect(modalSource).toContain("requestInspectionWorkspaceSection");
  });

  it("keeps persistence, APIs, and schema behavior out of the transition layer", () => {
    expect(modalSource).not.toContain("supabase.from(");
    expect(modalSource).not.toContain("/api/work-orders/import-from-inspection");
    expect(bridgeSource).not.toContain("fetch(");
    expect(bridgeSource).not.toContain("supabase");
    expect(bridgeSource).not.toContain("/api/");
    expect(bridgeSource).not.toContain("create table");
    expect(bridgeSource).not.toContain("alter table");
  });
});
