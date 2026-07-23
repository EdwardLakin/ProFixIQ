import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const screen = read("features/inspections/screens/GenericInspectionScreen.tsx");
const sectionDisplay = read(
  "features/inspections/lib/inspection/SectionDisplay.tsx",
);

describe("inspection corner-grid parity", () => {
  it("uses the generic runner for every compact grid type", () => {
    expect(screen).toContain("<CornerGrid");
    expect(screen).toContain("<AirCornerGrid");
    expect(screen).toContain("<TireGrid");
    expect(screen).toContain("<TireGridHydraulic");
    expect(screen).toContain("<BatteryGrid");
    expect(screen).toContain("showGridFindings");
  });

  it("renders canonical finding fields below compact measurements", () => {
    expect(sectionDisplay).toContain("showGridFindings?: boolean");
    expect(sectionDisplay).toContain("gridSection && !showGridFindings");
    expect(sectionDisplay).toContain("Finding details");
    expect(sectionDisplay).toContain("Notes, photos, parts and labor");
    expect(sectionDisplay).toContain("showPhotos={showPhotos}");
    expect(sectionDisplay).toContain("onUpdateParts?.");
    expect(sectionDisplay).toContain("onUpdateLaborHours?.");
  });

  it("removes legacy quick PM runners and routes", () => {
    expect(
      existsSync("features/inspections/screens/QuickPMScreen.tsx"),
    ).toBe(false);
    expect(
      existsSync("features/inspections/screens/QuickAirBrakePMScreen.tsx"),
    ).toBe(false);
    expect(existsSync("app/inspections/maintenance50/page.tsx")).toBe(false);
    expect(existsSync("app/inspections/maintenance50-air/page.tsx")).toBe(false);
  });
});
