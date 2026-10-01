import { describe, expect, it } from "vitest";
import {
  applyImportGrids,
  currentImportGridPlan,
  detectImportGridPlan,
  isImportGridSection,
} from "@/features/inspections/lib/fleet/importGrids";
import {
  normalizeInspectionFormSections,
  type InspectionFormSection,
} from "@/features/inspections/lib/form-import";

const check = (item: string) => ({ item, fieldType: "check" as const });
const measure = (item: string) => ({ item, fieldType: "measurement" as const });

// The runnable rows of the Hansen's quarterly tractor inspection.
function hansens(): InspectionFormSection[] {
  return [
    { title: "Powertrain", items: ["Engine/Transmission Leaks", "Exhaust System"].map(check) },
    { title: "Suspension", items: ["Frame and Attachments", "Shock Absorbers"].map(check) },
    { title: "Air Brakes", items: ["Air System Leakage", "Brake Chambers", "ABS System"].map(check) },
    { title: "Steering", items: ["Steering Box & Linkage"].map(check) },
    { title: "Lighting System", items: ["Headlights"].map(check) },
    { title: "Tires & Wheels", items: ["Tire Tread Depth", "Tire Tread & Sidewall Condition", "Wheel Hub"].map(check) },
    { title: "Head Rack", items: ["Decking"].map(check) },
  ];
}

const titles = (sections: InspectionFormSection[]) => sections.map((s) => s.title);

describe("detectImportGridPlan", () => {
  it("reads the Hansen's tractor as air brakes and wants both grids", () => {
    const plan = detectImportGridPlan({ sections: hansens(), vehicleType: "truck", dutyClass: "heavy" });
    expect(plan).toMatchObject({ brakeMode: "air", tireGrid: true, brakeGrid: true });
  });

  it("goes hydraulic on hydraulic wording, even for a truck", () => {
    const plan = detectImportGridPlan({
      sections: [{ title: "Brakes", items: [check("Brake fluid level"), check("Calipers")] }],
      vehicleType: "truck",
    });
    expect(plan.brakeMode).toBe("hydraulic");
  });

  it("does not let air suspension outvote explicit hydraulic-brake wording", () => {
    const plan = detectImportGridPlan({
      sections: [
        { title: "Suspension", items: [check("Air Suspension")] },
        { title: "Brakes", items: [check("Brake fluid level"), check("Calipers")] },
      ],
      vehicleType: "truck",
    });
    expect(plan.brakeMode).toBe("hydraulic");
  });

  it("picks the system the form names more often when both appear", () => {
    const plan = detectImportGridPlan({
      sections: [
        { title: "Air Brakes", items: [check("Brake Chambers"), check("Slack adjusters"), check("Air tanks")] },
        { title: "Notes", items: [check("Brake fluid")] },
      ],
    });
    expect(plan.brakeMode).toBe("air");
  });

  it("falls back on the vehicle: heavy -> air, car -> hydraulic", () => {
    const blank = [{ title: "Lights", items: [check("Headlights")] }];
    expect(detectImportGridPlan({ sections: blank, vehicleType: "bus" }).brakeMode).toBe("air");
    expect(detectImportGridPlan({ sections: blank, vehicleType: "car" }).brakeMode).toBe("hydraulic");
    expect(detectImportGridPlan({ sections: blank }).brakeMode).toBe("hydraulic");
  });

  it("offers both grids even where the form measures them itself, and says they replace its table", () => {
    const calgary: InspectionFormSection[] = [
      { title: "Brake Adjustment", items: [measure("Push Rod Travel Axle 1 Left"), measure("Push Rod Travel Axle 1 Right")] },
      { title: "Tires", items: [measure("LF Tire Pressure"), measure("RF Tread Depth")] },
    ];
    const plan = detectImportGridPlan({ sections: calgary });
    expect(plan).toMatchObject({
      brakeGrid: true, tireGrid: true, batteryGrid: false,
      sourceHasBrakeMeasurements: true, sourceHasTireMeasurements: true,
    });
    // pass/fail rows named "Tire Tread Depth" are not measurements
    expect(detectImportGridPlan({ sections: hansens() }).sourceHasTireMeasurements).toBe(false);
  });
});

describe("applyImportGrids", () => {
  const air = { tireGrid: true, brakeGrid: true, brakeMode: "air" as const };

  it("puts the grids at the top in the builder's order: brakes, tires, battery, then the checklist", () => {
    const out = applyImportGrids(hansens(), { ...air, batteryGrid: true }, { vehicleType: "truck" });
    expect(titles(out)).toEqual([
      "Corner Grid (Air)", "Tire Grid — Air Brake (HD)", "Battery Grid",
      "Powertrain", "Suspension", "Air Brakes", "Steering",
      "Lighting System", "Tires & Wheels", "Head Rack",
    ]);
    const battery = out.find((s) => s.title === "Battery Grid")!;
    expect(battery.generatedGrid?.kind).toBe("battery");
    expect(battery.items.map((i) => i.item)).toEqual(["Battery 1 Rated CCA", "Battery 1 Tested CCA"]);
    expect(currentImportGridPlan(out, "air").batteryGrid).toBe(true);
  });

  it("drops the form's own measurement-only tire table instead of repeating it, but keeps check rows", () => {
    const withTable: InspectionFormSection[] = [
      ...hansens(),
      { title: "TIRE TREAD DEPTH & PRESSURE", items: [measure("Outside / Inside"), measure("Inside / Outside")] },
    ];
    const out = applyImportGrids(withTable, air);
    expect(titles(out)).not.toContain("TIRE TREAD DEPTH & PRESSURE");
    expect(titles(out)).toContain("Tires & Wheels");
    // with the tire grid off the form's table is left alone
    expect(titles(applyImportGrids(withTable, { ...air, tireGrid: false }))).toContain("TIRE TREAD DEPTH & PRESSURE");
  });

  it("gives every dual axle an inner and an outer pressure", () => {
    const out = applyImportGrids(hansens(), air);
    const labels = out.find((s) => s.title.startsWith("Tire Grid"))!.items.map((i) => i.item);
    for (const axle of ["Drive 1", "Rear 1"]) {
      for (const side of ["Left", "Right"]) {
        expect(labels).toContain(`${axle} ${side} Tire Pressure (Outer)`);
        expect(labels).toContain(`${axle} ${side} Tire Pressure (Inner)`);
      }
    }
    const trailer = applyImportGrids(hansens(), air, { vehicleType: "trailer" }).find((s) => s.title === "Trailer Tire Grid")!;
    expect(trailer.items.map((i) => i.item)).toContain("Trailer 1 Left Tire Pressure (Inner)");
  });

  it("builds runnable measurement rows and keeps condition rows as checks", () => {
    const out = applyImportGrids(hansens(), air);
    const tire = out.find((s) => s.title === "Tire Grid — Air Brake (HD)")!;
    expect(tire.items.find((i) => i.item === "Steer 1 Left Tire Pressure")).toMatchObject({
      fieldType: "measurement", unit: "psi",
    });
    expect(tire.items.find((i) => i.item === "Steer 1 Left Tire Condition")?.fieldType).toBe("check");
    expect(out.find((s) => s.title === "Corner Grid (Air)")!.items.every((i) => i.fieldType)).toBe(true);
  });

  it("uses 32nds for tread when the source form is printed that way", () => {
    const out = applyImportGrids(hansens(), air, { extractedText: "NA /32 NA PSI" });
    const tread = out.find((s) => s.title.startsWith("Tire Grid"))!.items.filter((i) => /tread/i.test(i.item));
    expect(tread.length).toBeGreaterThan(0);
    expect(tread.every((i) => i.unit === "32nds")).toBe(true);
  });

  it("builds the hydraulic and trailer variants", () => {
    const hyd = applyImportGrids(hansens(), { ...air, brakeMode: "hydraulic" });
    expect(titles(hyd)).toContain("Tire Grid — Hydraulic");
    expect(titles(hyd)).toContain("Corner Grid (Hydraulic)");
    const trailer = applyImportGrids(hansens(), air, { vehicleType: "trailer" });
    expect(trailer.find((s) => s.title === "Trailer Tire Grid")!.items[0].item).toMatch(/^Trailer 1 Left/);
    // a hydraulic trailer gets pad/rotor rows, not push rods, and keeps its mode
    const hydTrailer = applyImportGrids(hansens(), { ...air, brakeMode: "hydraulic" }, { vehicleType: "trailer" });
    const corner = hydTrailer.find((s) => s.title === "Trailer Corner Grid")!;
    expect(corner.items.some((i) => /push rod/i.test(i.item))).toBe(false);
    expect(corner.items.some((i) => /brake pad/i.test(i.item))).toBe(true);
    expect(currentImportGridPlan(hydTrailer, "air").brakeMode).toBe("hydraulic");
  });

  it("puts the grids first even when the form has no tires or brakes section", () => {
    const out = applyImportGrids([{ title: "Lights", items: [check("Headlights")] }], air);
    expect(titles(out)).toEqual(["Corner Grid (Air)", "Tire Grid — Air Brake (HD)", "Lights"]);
  });

  it("is repeatable: re-applying replaces grids, and turning one off removes it", () => {
    const once = applyImportGrids(hansens(), air);
    const twice = applyImportGrids(once, air);
    expect(titles(twice)).toEqual(titles(once));
    const noTire = applyImportGrids(once, { ...air, tireGrid: false });
    expect(titles(noTire).some((t) => t.startsWith("Tire Grid"))).toBe(false);
    expect(titles(noTire)).toContain("Corner Grid (Air)");
    const switched = applyImportGrids(once, { ...air, brakeMode: "hydraulic" });
    expect(titles(switched)).not.toContain("Corner Grid (Air)");
    expect(titles(applyImportGrids(once, { ...air, tireGrid: false, brakeGrid: false }))).toEqual(titles(hansens()));
  });

  it("identifies its own sections by marker, not by title", () => {
    const out = applyImportGrids(hansens(), air);
    const generated = out.filter(isImportGridSection).map((s) => s.title);
    expect(generated).toEqual(["Corner Grid (Air)", "Tire Grid — Air Brake (HD)"]);
    expect(isImportGridSection({})).toBe(false);
  });

  it("keeps a customer's own section with a canonical title and does not rebuild it", () => {
    const own: InspectionFormSection = {
      title: "Corner Grid (Air)",
      items: [measure("Steer 1 Left Lining/Shoe")],
    };
    const out = applyImportGrids([...hansens(), own], { ...air, brakeGrid: false });
    expect(out.filter((s) => s.title === "Corner Grid (Air)")).toHaveLength(1);
    expect(out.find((s) => s.title === "Corner Grid (Air)")!.items).toHaveLength(1);
  });

  it("survives a reviewer renaming a generated grid", () => {
    const out = applyImportGrids(hansens(), air).map((s) =>
      s.generatedGrid?.kind === "tire" ? { ...s, title: "Tyres (customer layout)" } : s,
    );
    expect(currentImportGridPlan(out, "air").tireGrid).toBe(true);
    // re-applying replaces it instead of adding a duplicate
    const again = applyImportGrids(out, air);
    expect(again.filter((s) => s.generatedGrid?.kind === "tire")).toHaveLength(1);
    expect(again.some((s) => s.title === "Tyres (customer layout)")).toBe(false);
  });

  it("keeps the markers through the save path", () => {
    const out = applyImportGrids(hansens(), air);
    expect(normalizeInspectionFormSections(JSON.parse(JSON.stringify(out)))
      .filter((s) => s.generatedGrid)).toHaveLength(2);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("import grid wiring", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  it("adds the grids when an import is finalized and saves the plan", () => {
    const worker = read("features/inspections/server/inspection-form-import-job.ts");
    expect(worker).toContain("detectImportGridPlan");
    expect(worker).toContain("applyImportGrids(draftSections, gridPlan");
    expect(worker).toContain("draftSections: draftWithGrids");
  });

  it("derives and persists the plan for reviews read before grids existed", () => {
    const route = read("app/api/inspection-form-imports/[jobId]/route.ts");
    expect(route).toContain("if (!gridPlan)");
    expect(route).toContain("gridPlan,");
    expect(route).toContain("normalizeImportGridPlan(body.gridPlan)");
  });

  it("still never reshapes an imported form at run time", () => {
    const runPage = read("features/inspections/app/inspection/run/page.tsx");
    const shared = read("features/inspections/lib/inspection/prepareSectionsWithCornerGrid.ts");
    expect(runPage).toContain('mergedParams.grid = "none"');
    expect(shared).toContain("hasImportedFormClassification");
  });

  it("gives the reviewer the controls to remove or switch a grid", () => {
    const review = read("features/inspections/components/InspectionFormImportReview.tsx");
    expect(review).toContain("Tire grid (pressure and tread)");
    expect(review).toContain("Brake grid (pads, linings, push rod)");
    expect(review).toContain('aria-label="Brake system"');
  });
});
