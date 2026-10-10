import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCatalogPlan } from "./parseServiceCatalog";

const reel = buildCatalogPlan(
  readFileSync(join(__dirname, "../__fixtures__/service-catalog-shop-reel.csv"), "utf8"),
);

function template(name: string) {
  const value = reel.templates.find((candidate) => candidate.templateName === name);
  if (!value) throw new Error(`Missing fixture template: ${name}`);
  return value;
}

function itemByOriginal(templateName: string, original: string) {
  return template(templateName).sections
    .flatMap((section) => section.items)
    .find((item) => item.original === original);
}

describe("contextual service-catalog master matching", () => {
  it("improves master coverage on the shop reel without requiring exact wording", () => {
    // The first lexical-only implementation mapped 15 of the 113 source checks.
    expect(reel.summary.checklistItemsFromMaster).toBeGreaterThan(15);
  });

  it("uses air-brake context for condition-heavy component wording", () => {
    expect(itemByOriginal("Brake System Inspection", "Inspect chambers for damage or leakage")?.source).toBe("master");
    expect(itemByOriginal("Brake System Inspection", "Check slack adjuster travel and operation")?.source).toBe("master");
  });

  it("recognizes the off-road catalog from the inspection content", () => {
    expect(itemByOriginal("Heavy Equipment Preventive Maintenance", "Inspect hydraulic hoses and fittings for leaks")?.source).toBe("master");
    expect(itemByOriginal("Heavy Equipment Preventive Maintenance", "Check hydraulic oil level and condition")?.source).toBe("master");
  });

  it("does not let off-road rows leak into an explicitly highway template", () => {
    const csv = [
      "service_code,service_name,default_labor_hours,template_name,section,item,usage_context",
      ...[
        "Check hydraulic oil level and condition",
        "Item two",
        "Item three",
        "Item four",
        "Item five",
        "Item six",
        "Item seven",
        "Item eight",
      ].map((item) => `S1,Svc,1,Truck hydraulics,Misc,${item},Heavy-duty trucks`),
    ].join("\n");
    const plan = buildCatalogPlan(csv);
    const first = plan.templates[0].sections.flatMap((section) => section.items)[0];
    expect(first).toMatchObject({ original: "Check hydraulic oil level and condition", source: "custom" });
  });

  it("keeps workflow/diagnostic checks custom when no canonical inspection item is equivalent", () => {
    expect(itemByOriginal("No-Start / Electrical Diagnostic", "Confirm customer complaint and no-start condition")?.source).toBe("custom");
    expect(itemByOriginal("Field Service Arrival & Repair Inspection", "Document diagnosis and recommended repair")?.source).toBe("custom");
  });
});
