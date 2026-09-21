import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const screen = read("features/inspections/screens/GenericInspectionScreen.tsx");
const sectionDisplay = read(
  "features/inspections/lib/inspection/SectionDisplay.tsx",
);
const hydraulicBrakeGrid = read(
  "features/inspections/lib/inspection/ui/CornerGrid.tsx",
);
const airBrakeGrid = read(
  "features/inspections/lib/inspection/ui/AirCornerGrid.tsx",
);
const hydraulicTireGrid = read(
  "features/inspections/lib/inspection/ui/TireGridHydraulic.tsx",
);
const batteryGrid = read(
  "features/inspections/lib/inspection/ui/BatteryGrid.tsx",
);
const tireCornerGrid = read(
  "features/inspections/lib/inspection/ui/TireCornerGrid.tsx",
);
const measurementGridKeyboard = read(
  "features/inspections/lib/inspection/ui/measurementGridKeyboard.ts",
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

  it("uses native inputs for compact measurement grids, matching SectionDisplay tab behavior", () => {
    const grids = [
      hydraulicBrakeGrid,
      hydraulicTireGrid,
      batteryGrid,
      tireCornerGrid,
    ];

    expect(sectionDisplay).toContain('type="number"');
    for (const grid of grids) {
      expect(grid).toContain("<input");
      expect(grid).toContain("onChange=");
      expect(grid).not.toContain("MeasurementInput");
      expect(grid).not.toContain("tabIndex={0}");
    }
  });


  it("supports keyboard traversal across measurement inputs", () => {
    for (const grid of [
      hydraulicBrakeGrid,
      airBrakeGrid,
      hydraulicTireGrid,
      tireCornerGrid,
    ]) {
      expect(grid).toContain('data-inspection-measurement-grid');
      expect(grid).toContain('data-inspection-measurement-input="true"');
      expect(grid).toContain("handleMeasurementGridKeyDown");
    }

    expect(measurementGridKeyboard).toContain('event.key !== "Tab"');
    expect(measurementGridKeyboard).toContain('event.key !== "Enter"');
    expect(measurementGridKeyboard).toContain("next.focus()");
    expect(measurementGridKeyboard).toContain("next.select()");
  });

  it("keeps tire grids compact and ordered by physical axle position", () => {
    for (const grid of [hydraulicTireGrid, tireCornerGrid]) {
      expect(grid).toContain('data-axle={t.axle}');
      const leftOuter = grid.indexOf('"Left Outer"');
      const leftInner = grid.indexOf('"Left Inner"');
      const rightInner = grid.indexOf('"Right Inner"');
      const rightOuter = grid.indexOf('"Right Outer"');

      expect(leftOuter).toBeGreaterThanOrEqual(0);
      expect(leftInner).toBeGreaterThan(leftOuter);
      expect(rightInner).toBeGreaterThan(leftInner);
      expect(rightOuter).toBeGreaterThan(rightInner);

      expect(grid).toContain("Tread depth");
      expect(grid).toContain("Pressure");
      expect(grid).not.toContain("TP / TD capture only");
    }
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
