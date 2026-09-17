import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shell = readFileSync(
  "features/inspections/workspace/InspectionWorkspaceShell.tsx",
  "utf8",
);
const customerVehicleHeader = readFileSync(
  "features/inspections/lib/inspection/ui/CustomerVehicleHeader.tsx",
  "utf8",
);
const voiceButton = readFileSync(
  "features/inspections/lib/inspection/StartListeningButton.tsx",
  "utf8",
);
const cornerGrid = readFileSync(
  "features/inspections/lib/inspection/ui/CornerGrid.tsx",
  "utf8",
);
const photoUploadButton = readFileSync(
  "features/inspections/lib/inspection/PhotoUploadButton.tsx",
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

  it("keeps canonical controls injectable instead of moving persistence into the shell", () => {
    expect(shell).toContain("voiceControl?: ReactNode");
    expect(shell).toContain("reviewFindingsControl?: ReactNode");
    expect(shell).toContain("addPhotoControl?: ReactNode");
    expect(shell).toContain("signControl?: ReactNode");
    expect(shell).toContain("submitControl?: ReactNode");
    expect(shell).toContain("onSelectSection: (sectionId: string) => void");
  });

  it("renders only the selected inspection section in the center workspace", () => {
    expect(shell).toContain("data-inspection-workspace-runtime");
    expect(shell).toContain("[data-inspection-workspace-runtime] [data-section-index]");
    expect(shell).toContain("display: none !important");
    expect(shell).toContain("activeSelector");
    expect(shell).toContain("display: block !important");
  });

  it("removes duplicate context and relocates voice access to the command rail", () => {
    expect(customerVehicleHeader).toContain(
      'data-inspection-customer-vehicle-header="true"',
    );
    expect(voiceButton).toContain('data-inspection-voice-start-control="true"');
    expect(shell).toContain("data-inspection-customer-vehicle-header");
    expect(shell).toContain("data-inspection-voice-start-control");
    expect(shell).toContain('label="Start Listening"');
    expect(shell).toContain("clickCanonicalVoice");
  });

  it("keeps the right rail focused on actionable inspection commands", () => {
    expect(shell).not.toContain('label="Review findings"');
    expect(shell).not.toContain('label="Add photo"');
    expect(shell).toContain('label="Sign inspection"');
    expect(shell).toContain('label="Submit findings"');
  });

  it("makes live findings navigate back to their inspection item", () => {
    expect(shell).toContain("focusFinding");
    expect(shell).toContain("onClick={() => focusFinding(finding)}");
    expect(shell).toContain("finding.id.split(\":\")");
    expect(shell).toContain("scrollIntoView");
  });

  it("opens the first visible part row from the workspace add-part action", () => {
    expect(shell).toContain('label !== "+ add part"');
    expect(shell).toContain('"+ add another part"');
    expect(shell).toContain("addAnother?.click()");
  });

  it("lets item photo evidence use the native image chooser instead of forcing the camera", () => {
    expect(photoUploadButton).toContain('type="file"');
    expect(photoUploadButton).toContain('accept="image/*"');
    expect(photoUploadButton).toContain("multiple");
    expect(photoUploadButton).not.toContain('capture="environment"');
  });

  it("uses a readable four-corner hydraulic measurement presentation", () => {
    expect(cornerGrid).toContain('data-inspection-corner-grid="hydraulic"');
    expect(cornerGrid).toContain("Left Front");
    expect(cornerGrid).toContain("Right Front");
    expect(cornerGrid).toContain("Left Rear");
    expect(cornerGrid).toContain("Right Rear");
    expect(cornerGrid).toContain("Pad / shoe thickness");
    expect(cornerGrid).toContain("Rotor / drum thickness");
  });
});
