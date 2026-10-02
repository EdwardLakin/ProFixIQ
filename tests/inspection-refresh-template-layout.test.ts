import { describe, expect, it } from "vitest";
import {
  declinedGridsFromTags,
  refreshTemplateLayout,
  tagsWithDeclinedGrids,
} from "@/features/inspections/lib/fleet/refreshTemplateLayout";
import {
  emptyInspectionFormContext,
  type InspectionFormContext,
  type InspectionFormSection,
} from "@/features/inspections/lib/form-import";

const check = (item: string) => ({ item, fieldType: "check" as const });

// A Hansen's template saved before the new layout existed.
function oldTemplate(): { sections: InspectionFormSection[]; formContext: InspectionFormContext } {
  const formContext = emptyInspectionFormContext();
  formContext.header = [
    { title: "Trip and vehicle record", items: [{ item: "DATE" }, { item: "VIN#" }] },
    { title: "Certificate of Inspection", items: [{ item: "Date of Inspection" }, { item: "License#" }] },
    { title: "Page 1 of 2", items: [{ item: "Page 1 of 2" }, { item: "Pass / Fail / N/A" }] },
    { title: "Issued By", items: [{ item: "Issued By: Fleet Manager" }] },
  ];
  formContext.completion = [
    { title: "Certificate of Inspection", items: [{ item: "Technician Signature", fieldType: "signature" }] },
  ];
  return {
    formContext,
    sections: [
      { title: "Air Brakes", items: ["Brake Chambers", "Air System Leakage"].map(check) },
      { title: "Tires & Wheels", items: ["Tire Tread Depth", "Wheel Hub"].map(check) },
    ],
  };
}

describe("refreshTemplateLayout", () => {
  const { sections, formContext } = oldTemplate();
  const out = refreshTemplateLayout({ sections, formContext, vehicleType: "truck", title: "Hansen's Quarterly" });

  it("reshapes the context without touching the checklist rows", () => {
    const completion = out.formContext.completion.flatMap((s) => s.items.map((i) => i.item));
    expect(completion).toEqual(["Date of Inspection", "License#", "Technician Signature"]);
    const all = INSPECTION_BLOCKS.flatMap((b) => out.formContext[b].flatMap((s) => s.items.map((i) => i.item)));
    expect(all).not.toContain("Page 1 of 2");
    expect(out.formContext.branding.flatMap((s) => s.items.map((i) => i.item))).toContain("Issued By: Fleet Manager");
    expect(out.sections.find((s) => s.title === "Air Brakes")!.items).toHaveLength(2);
  });

  it("adds the grids the form calls for, at the top of the checklist", () => {
    expect(out.gridPlan).toMatchObject({ tireGrid: true, brakeGrid: true, brakeMode: "air" });
    expect(out.sections.map((s) => s.title)).toEqual([
      "Corner Grid (Air)", "Tire Grid — Air Brake (HD)", "Air Brakes", "Tires & Wheels",
    ]);
  });

  it("describes what it will change", () => {
    expect(out.changed).toBe(true);
    const text = out.summary.join("\n");
    expect(text).toMatch(/certificate field/i);
    expect(text).toMatch(/page marker/i);
    expect(text).toMatch(/tire grid/i);
    expect(text).toMatch(/brake corner grid/i);
  });

  it("is idempotent: refreshing a refreshed template changes nothing", () => {
    const again = refreshTemplateLayout({
      sections: out.sections, formContext: out.formContext, vehicleType: "truck", title: "Hansen's Quarterly",
    });
    expect(again.changed).toBe(false);
    expect(again.summary).toEqual([]);
  });

  it("honours the reviewer's grid choices and the tread unit", () => {
    const custom = refreshTemplateLayout({
      sections, formContext, vehicleType: "truck",
      plan: { tireGrid: true, brakeGrid: false, brakeMode: "hydraulic" },
      treadUnit: "32nds",
    });
    expect(custom.sections.map((s) => s.title)).toEqual([
      "Tire Grid — Hydraulic", "Hydraulic Brakes", "Tires & Wheels",
    ]);
    const tread = custom.sections.find((s) => s.title.startsWith("Tire Grid"))!.items.filter((i) => /tread/i.test(i.item));
    expect(tread.every((i) => i.unit === "32nds")).toBe(true);
  });

  it("keeps a template's earlier grid choices instead of re-adding what was removed", () => {
    const first = refreshTemplateLayout({ sections, formContext, vehicleType: "truck", plan: { brakeGrid: false } });
    const again = refreshTemplateLayout({ sections: first.sections, formContext: first.formContext, vehicleType: "truck" });
    expect(again.gridPlan.brakeGrid).toBe(false);
    expect(again.sections.some((s) => s.generatedGrid?.kind === "brake")).toBe(false);
  });

  it("reports nothing to do for a template that is already current", () => {
    const empty = refreshTemplateLayout({
      sections: [{ title: "Lights", items: [check("Headlights")] }],
      formContext: emptyInspectionFormContext(),
      plan: { tireGrid: false, brakeGrid: false },
    });
    expect(empty.changed).toBe(false);
  });
});

const INSPECTION_BLOCKS = ["header", "notices", "notes", "completion", "branding"] as const;

import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("review hardening", () => {
  const { sections, formContext } = oldTemplate();
  const treads = (secs: InspectionFormSection[]) =>
    secs.find((s) => s.generatedGrid?.kind === "tire")!.items.filter((i) => /tread/i.test(i.item));

  it("keeps saved 32nds tread units when the selector is left alone", () => {
    const first = refreshTemplateLayout({ sections, formContext, vehicleType: "truck", treadUnit: "32nds" });
    expect(treads(first.sections).every((i) => i.unit === "32nds")).toBe(true);

    // a later, context-only refresh with the selector untouched must not relabel them
    const noisy = emptyInspectionFormContext();
    noisy.header = [{ title: "Page 2 of 2", items: [{ item: "Page 2 of 2" }] }];
    const second = refreshTemplateLayout({ sections: first.sections, formContext: noisy, vehicleType: "truck" });
    expect(treads(second.sections).every((i) => i.unit === "32nds")).toBe(true);

    // an explicit choice still wins
    const back = refreshTemplateLayout({ sections: first.sections, formContext, vehicleType: "truck", treadUnit: "mm" });
    expect(treads(back.sections).every((i) => i.unit === "mm")).toBe(true);
  });

  it("round-trips an explicit no-grid choice through tags", () => {
    const off = refreshTemplateLayout({
      sections, formContext, vehicleType: "truck", plan: { tireGrid: false, brakeGrid: false },
    });
    expect(off.declined).toEqual({ tireGrid: true, brakeGrid: true });
    const tags = tagsWithDeclinedGrids(["customer-form", "fleet"], off.declined);
    expect(tags).toEqual(["customer-form", "fleet", "layout:no-tire-grid", "layout:no-brake-grid"]);
    expect(declinedGridsFromTags(tags)).toEqual({ tireGrid: true, brakeGrid: true });

    // saved + reopened: no grid sections, tags present -> nothing left to apply
    const reopened = refreshTemplateLayout({
      sections: off.sections, formContext: off.formContext, vehicleType: "truck",
      declined: declinedGridsFromTags(tags),
    });
    expect(reopened.gridPlan).toMatchObject({ tireGrid: false, brakeGrid: false });
    expect(reopened.changed).toBe(false);
    expect(reopened.sections.some((s) => s.generatedGrid)).toBe(false);

    // without the tags the grids would be offered again (the bug being fixed)
    expect(
      refreshTemplateLayout({ sections: off.sections, formContext: off.formContext, vehicleType: "truck" }).changed,
    ).toBe(true);
  });

  it("only tags what the form actually calls for, and clears tags when a grid is turned back on", () => {
    const hydraulicNoGrid = refreshTemplateLayout({
      sections: [{ title: "Lights", items: [check("Headlights")] }],
      formContext: emptyInspectionFormContext(),
      plan: { tireGrid: true, brakeGrid: true },
    });
    expect(hydraulicNoGrid.declined).toEqual({ tireGrid: false, brakeGrid: false });
    const on = tagsWithDeclinedGrids(["fleet", "layout:no-tire-grid"], { tireGrid: false, brakeGrid: false });
    expect(on).toEqual(["fleet"]);
  });
});

describe("refresh persistence wiring", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  it("sends the refreshed context only when it changed, on both save paths", () => {
    const editor = read("features/inspections/components/InspectionTemplateEditRouter.tsx");
    expect(editor).toContain("...(formContextDirty ? { formContext } : {})");
    expect(editor).toContain("...(formContextDirty ? { form_context: formContext } : {})");
    expect(editor).toContain("...(tagsDirty ? { tags } : {})");
    // grid markers must survive an ordinary save
    expect(editor).toContain("generatedGrid: section.generatedGrid");
  });

  it("lets the field-app save path store the preserved form context, normalised and bounded", () => {
    const route = read("app/api/mobile/service/inspection-templates/route.ts");
    expect(route).toContain('hasOwnField(body, "formContext")');
    expect(route).toContain("normalizeInspectionFormContext");
    expect(route).toContain("200_000");
  });
});

describe("refreshTemplateLayout — grid layout", () => {
  const air = { tireGrid: true, brakeGrid: true, brakeMode: "air" as const };

  it("moves grids saved after their matching sections to the top and says so", () => {
    const old: InspectionFormSection[] = [
      { title: "Air Brakes", items: [check("Brake chambers")] },
      { title: "Tires & Wheels", items: [check("Tire condition")] },
      { title: "Tire Grid — Air Brake (HD)", items: [{ item: "Steer 1 Left Tire Pressure", unit: "psi", fieldType: "measurement" }], generatedGrid: { kind: "tire", brakeMode: "air" } },
    ];
    const out = refreshTemplateLayout({ sections: old, vehicleType: "truck" });
    expect(out.sections[0].title).toBe("Tire Grid — Air Brake (HD)");
    expect(out.summary.join("\n")).toMatch(/move the grids to the top/i);
    expect(out.gridPlan).toMatchObject({ tireGrid: true, brakeGrid: false });
  });

  it("removes the form's own tire table the grid replaces and adds a chosen battery grid", () => {
    const out = refreshTemplateLayout({
      sections: [
        { title: "Air Brakes", items: [check("Brake chambers")] },
        { title: "TIRE TREAD DEPTH & PRESSURE", items: [{ item: "Outside / Inside", unit: "/32", fieldType: "measurement" }] },
      ],
      vehicleType: "truck",
      plan: { ...air, batteryGrid: true },
    });
    expect(out.sections.map((s) => s.title)).toEqual([
      "Corner Grid (Air)", "Tire Grid — Air Brake (HD)", "Battery Grid", "Air Brakes",
    ]);
    const text = out.summary.join("\n");
    expect(text).toMatch(/TIRE TREAD DEPTH & PRESSURE/);
    expect(text).toMatch(/battery grid/i);
  });
});

describe("refreshTemplateLayout — brake system switch", () => {
  it("says what the hydraulic switch changes and restores on the way back", () => {
    const sections: InspectionFormSection[] = [
      { title: "Air Brakes", items: [check("Air System Leakage"), check("ABS System")] },
    ];
    const hyd = refreshTemplateLayout({ sections, vehicleType: "truck", plan: { tireGrid: true, brakeGrid: true, brakeMode: "hydraulic" } });
    expect(hyd.summary.join("\n")).toMatch(/Switch "Air Brakes" to hydraulic brakes/);
    const back = refreshTemplateLayout({ sections: hyd.sections, vehicleType: "truck", plan: { brakeMode: "air" } });
    expect(back.summary.join("\n")).toMatch(/Restore the printed "Air Brakes"/);
  });
});

describe("refreshTemplateLayout — template saved by the earlier layout", () => {
  it("moves the grids to the top, drops the duplicate tread table and fixes the tread row", () => {
    const old: InspectionFormSection[] = [
      { title: "Air Brakes", items: [check("Air System Leakage"), check("Brake Chambers"), check("ABS System")] },
      { title: "Corner Grid (Hydraulic)", items: [{ item: "LF Brake Pad", unit: "mm", fieldType: "measurement" }], generatedGrid: { kind: "brake", brakeMode: "hydraulic" } },
      { title: "Body & Chassis", items: [check("Hood")] },
      { title: "Tires & Wheels", items: [{ item: "Tire Tread Depth", unit: "mm", fieldType: "measurement" }, check("Wheel Hub")] },
      { title: "TIRE TREAD DEPTH & PRESSURE", items: [{ item: "Outside / Inside", unit: "/32", fieldType: "measurement" }, { item: "Inside / Outside", unit: "/32", fieldType: "measurement" }] },
      { title: "Tire Grid — Hydraulic", items: [{ item: "LF Tire Pressure", unit: "psi", fieldType: "measurement" }], generatedGrid: { kind: "tire", brakeMode: "hydraulic" } },
    ];
    const out = refreshTemplateLayout({ sections: old, vehicleType: "truck", title: "Hansen's Quarterly" });
    expect(out.sections.map((s) => s.title)).toEqual([
      "Corner Grid (Hydraulic)", "Tire Grid — Hydraulic", "Hydraulic Brakes", "Body & Chassis", "Tires & Wheels",
    ]);
    const tread = out.sections.find((s) => s.title === "Tires & Wheels")!.items[0];
    expect(tread).toMatchObject({ item: "Tire Tread Depth", fieldType: "check", unit: null });
    expect(out.summary.join("\n")).toMatch(/TIRE TREAD DEPTH & PRESSURE/);
  });
});
