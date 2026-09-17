import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shell = readFileSync(
  "features/inspections/workspace/InspectionWorkspaceShell.tsx",
  "utf8",
);

describe("inspection workspace shell", () => {
  it("keeps the reference three-surface composition explicit", () => {
    expect(shell).toContain("data-inspection-workspace");
    expect(shell).toContain("data-inspection-workspace-sections");
    expect(shell).toContain("data-inspection-workspace-center");
    expect(shell).toContain("data-inspection-workspace-center-rail");
    expect(shell).toContain("Inspection Sections");
    expect(shell).toContain("Inspection workspace");
    expect(shell).toContain("Inspection Center");
    expect(shell).toContain("Live Findings");
  });

  it("keeps inspection behavior outside the shell", () => {
    expect(shell).not.toContain("createBrowserSupabase");
    expect(shell).not.toContain("useInspectionAutosave");
    expect(shell).not.toContain("addWorkOrderLineFromSuggestion");
    expect(shell).not.toContain("/api/");
    expect(shell).not.toContain("work_order_");
  });

  it("exposes existing controls as injected UI instead of redefining actions", () => {
    expect(shell).toContain("voiceControl?: ReactNode");
    expect(shell).toContain("reviewFindingsControl?: ReactNode");
    expect(shell).toContain("addPhotoControl?: ReactNode");
    expect(shell).toContain("signControl?: ReactNode");
    expect(shell).toContain("submitControl?: ReactNode");
    expect(shell).toContain("onSelectSection: (sectionId: string) => void");
  });
});
