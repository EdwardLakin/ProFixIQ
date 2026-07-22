import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const cornerGrid = read(
  "features/inspections/lib/inspection/ui/CornerGrid.tsx",
);
const sectionDisplay = read(
  "features/inspections/lib/inspection/SectionDisplay.tsx",
);
const autosave = read(
  "features/inspections/hooks/useInspectionAutosave.ts",
);
describe("premium inspection layout and signing repair", () => {
  it("renders the hydraulic corner grid without decorative empty cells or sketch copy", () => {
    expect(cornerGrid).toContain("Hydraulic brake measurements");
    expect(cornerGrid).toContain("md:grid-cols-2");
    expect(cornerGrid).not.toContain("spacer(body)");
    expect(cornerGrid).not.toContain("matches sketch");
    expect(cornerGrid).not.toContain('h-[110px]');
  });

  it("separates item counts from bulk status actions", () => {
    expect(sectionDisplay).toContain('aria-label="Section item counts"');
    expect(sectionDisplay).toContain('aria-label="Bulk section actions"');
    expect(sectionDisplay).toContain("Set section");
    expect(sectionDisplay).toContain("lg:grid-cols-[minmax(0,1fr)_auto]");
  });

  it("does not expose raw database conflict details to technicians", () => {
    expect(autosave).toContain(
      "Your work remains safe on this device.",
    );
    expect(autosave).toContain("inspectionSyncErrorMessage");
  });
});
