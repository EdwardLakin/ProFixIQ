import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { toInspectionCategories } from "@/features/inspections/lib/inspection/normalize";
import {
  buildCatalogPlan,
  buildCatalogServiceKey,
  parseCatalogCsv,
  toImportPayload,
} from "./parseServiceCatalog";

const fixture = readFileSync(join(__dirname, "../__fixtures__/service-catalog-fleet.csv"), "utf8");

describe("buildCatalogPlan", () => {
  const plan = buildCatalogPlan(fixture);

  it("recognizes services, templates and links with nothing needing review", () => {
    expect(plan.summary.servicesRecognized).toBe(24);
    expect(plan.summary.servicesImportable).toBe(24);
    expect(plan.summary.templatesImportable).toBe(9);
    expect(plan.summary.linksImportable).toBe(9);
    expect(plan.summary.reviewRequired).toBe(0);
  });

  it("uses service_name, not service_code, as the name even when code comes first", () => {
    const pm = plan.services.find((s) => s.serviceCode === "PM-HD");
    expect(pm?.name).toBe("Heavy-Duty PM Service");
    expect(pm?.templateName).toBe("Heavy-Duty PM");
    expect(pm?.laborHours).toBe(3.5);
    expect(pm?.price).toBe(577.5);
  });

  it("emits sections in the exact shape the inspection runtime consumes", () => {
    const payload = toImportPayload(plan);
    const pm = payload.templates.find((t) => t.name === "Heavy-Duty PM");
    expect(Array.isArray(pm?.sections)).toBe(true);

    const categories = toInspectionCategories(pm?.sections);
    expect(categories.map((c) => c.title)).toEqual([
      "Engine & Fluids",
      "Fuel & Aftertreatment",
      "Air & Brakes",
      "Chassis & Safety",
    ]);
    expect(categories[0].items.map((i) => i.item)).toContain("Engine oil level and condition");
    expect(categories.reduce((n, c) => n + c.items.length, 0)).toBe(14);
  });

  it("yields identical keys on re-upload (identity is the code, not the upload)", () => {
    const again = buildCatalogPlan(fixture);
    expect(again.services.map((s) => s.serviceKey)).toEqual(plan.services.map((s) => s.serviceKey));
    expect(plan.services.find((s) => s.serviceCode === "PM-HD")?.serviceKey).toBe("catalog:code:pm-hd");
  });
});

describe("service identity", () => {
  it("falls back to a deterministic normalized name without a code", () => {
    expect(buildCatalogServiceKey(null, "Oil & Filter  Change").serviceKey).toBe("catalog:name:oil-and-filter-change");
    expect(buildCatalogServiceKey(null, "oil and filter change").serviceKey).toBe("catalog:name:oil-and-filter-change");
  });
});

describe("confidence and review", () => {
  it("flags services with no labor or price and thin checklists instead of importing them", () => {
    const csv = [
      "service_code,service_name,default_labor_hours,inspection_template,section,checklist_item",
      "A-1,Mystery Job,,,,",
      "A-2,Quick Check,1,Tiny Inspection,General,Only item",
    ].join("\n");
    const plan = buildCatalogPlan(csv);
    expect(plan.services.find((s) => s.serviceCode === "A-1")?.needsReview).toBe(true);
    expect(plan.templates[0].needsReview).toBe(true);
    expect(plan.services.find((s) => s.serviceCode === "A-2")?.templateKey).toBeNull();
    expect(plan.summary.reviewRequired).toBe(2);
    const payload = toImportPayload(plan);
    expect(payload.services.map((s) => s.service_code)).toEqual(["A-2"]);
    expect(payload.templates).toHaveLength(0);
  });

  it("links by name when no explicit template column value is given", () => {
    const rows = ["service_code,service_name,default_labor_hours,inspection_template,section,checklist_item"];
    for (let i = 1; i <= 8; i += 1) rows.push(`,,,Brake Inspection,Brakes,Check ${i}`);
    rows.push("B-1,Brake Inspection,1.5,,,");
    const plan = buildCatalogPlan(rows.join("\n"));
    expect(plan.services[0].templateName).toBe("Brake Inspection");
    expect(plan.services[0].linkSource).toBe("name_match");
  });
});

describe("parseCatalogCsv", () => {
  it("handles quoted commas, escaped quotes and embedded newlines", () => {
    const { rows } = parseCatalogCsv('a,b\n"x, y","say ""hi"""\n"line1\nline2",z');
    expect(rows[0]).toEqual({ a: "x, y", b: 'say "hi"' });
    expect(rows[1].a).toBe("line1\nline2");
  });
});
