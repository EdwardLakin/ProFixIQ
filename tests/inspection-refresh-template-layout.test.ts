import { describe, expect, it } from "vitest";
import { refreshTemplateLayout } from "@/features/inspections/lib/fleet/refreshTemplateLayout";
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

  it("adds the grids the form calls for, after the matching sections", () => {
    expect(out.gridPlan).toMatchObject({ tireGrid: true, brakeGrid: true, brakeMode: "air" });
    expect(out.sections.map((s) => s.title)).toEqual([
      "Air Brakes", "Corner Grid (Air)", "Tires & Wheels", "Tire Grid — Air Brake (HD)",
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
      "Air Brakes", "Tires & Wheels", "Tire Grid — Hydraulic",
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

describe("refresh persistence wiring", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  it("sends the refreshed context only when it changed, on both save paths", () => {
    const editor = read("features/inspections/components/InspectionTemplateEditRouter.tsx");
    expect(editor).toContain("...(formContextDirty ? { formContext } : {})");
    expect(editor).toContain("...(formContextDirty ? { form_context: formContext } : {})");
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
