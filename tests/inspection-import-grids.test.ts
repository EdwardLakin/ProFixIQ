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

  it("brings the form's table back when the grid that replaced it is turned off", () => {
    const withTable: InspectionFormSection[] = [
      ...hansens(),
      { title: "TIRE TREAD DEPTH & PRESSURE", items: [measure("Outside / Inside"), measure("Inside / Outside")] },
    ];
    const on = applyImportGrids(withTable, air);
    const off = applyImportGrids(on, { ...air, tireGrid: false });
    expect(titles(off)).toContain("TIRE TREAD DEPTH & PRESSURE");
    expect(titles(off)).not.toContain("Tire Grid — Air Brake (HD)");
    // and survives being saved and reloaded
    const reloaded = normalizeInspectionFormSections(JSON.parse(JSON.stringify(on)));
    expect(titles(applyImportGrids(reloaded, { ...air, tireGrid: false }))).toContain("TIRE TREAD DEPTH & PRESSURE");
  });

  it("finds a plainly titled table by its rows, the way detection does", () => {
    const plain: InspectionFormSection[] = [
      ...hansens(),
      { title: "Tires", items: [measure("LF Tire Pressure"), measure("RF Tread Depth")] },
    ];
    expect(titles(applyImportGrids(plain, air))).not.toContain("Tires");
    // a titled-only match needs every row to be a measurement
    const mixed: InspectionFormSection[] = [
      { title: "Tires", items: [measure("LF Tire Pressure"), check("Sidewall condition")] },
    ];
    expect(titles(applyImportGrids(mixed, air))).toContain("Tires");
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

describe("applyImportGrids — hydraulic brake system and stray reading rows", () => {
  const airForm = (): InspectionFormSection[] => [
    {
      title: "Air Brakes",
      items: [
        "Air System Leakage", "Air Tank(s)", "Brake Pedal / Actuator", "Brake Valves & Controls",
        "Tractor Protection Valve", "Parking Brake & Emergency Application", "Brake Chambers",
        "Drum or Disk Brake Components", "ABS System",
      ].map(check),
    },
    { title: "Tires & Wheels", items: [{ item: "Tire Tread Depth", unit: "mm", fieldType: "measurement" as const }, check("Tire Tread & Sidewall Condition")] },
  ];
  const hyd = { tireGrid: true, brakeGrid: true, brakeMode: "hydraulic" as const };
  const air = { ...hyd, brakeMode: "air" as const };

  it("turns the air-brake checklist into a hydraulic one, dropping air-only rows", () => {
    const out = applyImportGrids(airForm(), hyd);
    const section = out.find((s) => s.title === "Hydraulic Brakes")!;
    expect(titles(out)).not.toContain("Air Brakes");
    expect(section.items.map((i) => i.item)).toEqual([
      "Hydraulic System Leakage", "Brake Fluid Reservoir / Master Cylinder", "Brake Pedal / Actuator",
      "Brake Lines & Hoses", "Parking Brake & Emergency Application", "Calipers / Wheel Cylinders",
      "Drum or Disk Brake Components", "ABS System",
    ]);
    expect(section.items.every((i) => i.fieldType === "check")).toBe(true);
  });

  it("restores the printed air-brake section when switched back, also after save and reload", () => {
    const asHyd = applyImportGrids(airForm(), hyd);
    const reloaded = normalizeInspectionFormSections(JSON.parse(JSON.stringify(asHyd)));
    const back = applyImportGrids(reloaded, air);
    expect(titles(back)).toContain("Air Brakes");
    expect(titles(back)).not.toContain("Hydraulic Brakes");
    expect(back.find((s) => s.title === "Air Brakes")!.items.map((i) => i.item)).toContain("Tractor Protection Valve");
  });

  it("is idempotent on re-apply", () => {
    const once = applyImportGrids(airForm(), hyd);
    expect(applyImportGrids(once, hyd)).toEqual(once);
  });

  it("makes 'Tire Tread Depth' in the checklist a pass/fail row once the tire grid is on", () => {
    const on = applyImportGrids(airForm(), air);
    const row = on.find((s) => s.title === "Tires & Wheels")!.items.find((i) => i.item === "Tire Tread Depth")!;
    expect(row).toMatchObject({ fieldType: "check", unit: null });
    const off = applyImportGrids(airForm(), { ...air, tireGrid: false });
    expect(off.find((s) => s.title === "Tires & Wheels")!.items[0].fieldType).toBe("measurement");
  });

  it("keeps a reviewer's edit to the adapted section while hydraulic stays selected", () => {
    const once = applyImportGrids(airForm(), hyd);
    const edited = once.map((s) =>
      s.title === "Hydraulic Brakes"
        ? { ...s, items: [...s.items, { item: "Brake fluid colour", fieldType: "check" as const }] }
        : s,
    );
    const again = applyImportGrids(edited, { ...hyd, tireGrid: false });
    expect(again.find((s) => s.title === "Hydraulic Brakes")!.items.map((i) => i.item)).toContain("Brake fluid colour");
    // an explicit switch back to air restores the printed section
    expect(titles(applyImportGrids(edited, air))).toContain("Air Brakes");
  });

  it("restores a reading row when its grid is turned off", () => {
    const on = applyImportGrids(airForm(), air);
    const off = applyImportGrids(on, { ...air, tireGrid: false });
    const row = off.find((s) => s.title === "Tires & Wheels")!.items.find((i) => i.item === "Tire Tread Depth")!;
    expect(row).toMatchObject({ fieldType: "measurement", unit: "mm" });
    expect(row.printedAs).toBeUndefined();
    // and survives save and reload
    const reloaded = normalizeInspectionFormSections(JSON.parse(JSON.stringify(on)));
    const back = applyImportGrids(reloaded, { ...air, tireGrid: false });
    expect(back.find((s) => s.title === "Tires & Wheels")!.items[0]).toMatchObject({ fieldType: "measurement", unit: "mm" });
  });

  it("drops every air-only row, never relabelling an unknown air row as hydraulic", () => {
    const out = applyImportGrids(
      [{ title: "Air Brakes", items: [
        "Park brake (spring brake) function", "Air supply system", "Tank drain valves", "Low air warning",
        "Glad hands & air lines", "Brake pedal feel",
      ].map(check) }],
      hyd,
    );
    expect(out.find((s) => s.title === "Hydraulic Brakes")!.items.map((i) => i.item)).toEqual([
      "Parking Brake Function", "Brake pedal feel",
    ]);
  });
});
