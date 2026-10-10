import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCatalogPlan, deriveCatalogAssetScope } from "./parseServiceCatalog";

function itemByOriginal(plan: ReturnType<typeof buildCatalogPlan>, original: string) {
  return plan.templates
    .flatMap((template) => template.sections.flatMap((section) => section.items))
    .find((item) => item.original === original);
}

describe("service catalog master-match context", () => {
  it("derives asset scope from explicit template metadata", () => {
    expect(
      deriveCatalogAssetScope(
        "Off-highway construction and industrial equipment",
        "Heavy Equipment Preventive Maintenance",
      ),
    ).toBe("off_road");
    expect(
      deriveCatalogAssetScope(
        "Heavy-duty trucks and highway tractors",
        "Heavy-Duty PM Service",
      ),
    ).toBe("on_road");
    expect(
      deriveCatalogAssetScope(
        "Mixed trucks and heavy equipment",
        "Mixed Fleet Inspection",
      ),
    ).toBe("unknown");
  });

  it("keeps the demo equipment mappings by using its explicit off-highway context", () => {
    const plan = buildCatalogPlan(
      readFileSync(join(__dirname, "../__fixtures__/service-catalog-shop-reel.csv"), "utf8"),
    );
    expect(itemByOriginal(plan, "Check hydraulic oil level and condition")).toMatchObject({
      source: "master",
      item: "Hydraulic fluid level / condition",
    });
  });

  it("does not infer equipment scope from a hydraulic checklist line alone", () => {
    const csv = [
      "service_code,service_name,default_labor_hours,template_name,section,item",
      "S1,Hydraulic PM,1,Hydraulic PM,Hydraulics,Check hydraulic oil level and condition",
      "S1,Hydraulic PM,1,Hydraulic PM,Hydraulics,Item two",
      "S1,Hydraulic PM,1,Hydraulic PM,Hydraulics,Item three",
      "S1,Hydraulic PM,1,Hydraulic PM,Hydraulics,Item four",
      "S1,Hydraulic PM,1,Hydraulic PM,Hydraulics,Item five",
      "S1,Hydraulic PM,1,Hydraulic PM,Hydraulics,Item six",
      "S1,Hydraulic PM,1,Hydraulic PM,Hydraulics,Item seven",
      "S1,Hydraulic PM,1,Hydraulic PM,Hydraulics,Item eight",
    ].join("\n");
    const plan = buildCatalogPlan(csv);
    expect(itemByOriginal(plan, "Check hydraulic oil level and condition")).toMatchObject({
      source: "custom",
      item: "Check hydraulic oil level and condition",
    });
  });

  it("uses a declared brake system when filtering master candidates", () => {
    const rows = [
      "Check governor cut-in and cut-out",
      "Item two",
      "Item three",
      "Item four",
      "Item five",
      "Item six",
      "Item seven",
      "Item eight",
    ];
    const csv = [
      "service_code,service_name,default_labor_hours,template_name,section,item,usage_context,brake_system,duty_class",
      ...rows.map(
        (item) => `S1,Hydraulic Brake Check,1,Hydraulic Brake Check,Brakes,${item},Heavy-duty trucks,hydraulic,heavy`,
      ),
    ].join("\n");
    const plan = buildCatalogPlan(csv);
    expect(itemByOriginal(plan, "Check governor cut-in and cut-out")).toMatchObject({
      source: "custom",
      item: "Check governor cut-in and cut-out",
    });
  });
});
