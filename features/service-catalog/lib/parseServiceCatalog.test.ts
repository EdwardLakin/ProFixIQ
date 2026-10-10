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
    expect(categories[0].items.map((i) => i.item)).toContain("Engine oil level/condition");
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

describe("shop reel service catalog (menu items + inspections)", () => {
  const csv = readFileSync(join(__dirname, "../__fixtures__/service-catalog-shop-reel.csv"), "utf8");
  const plan = buildCatalogPlan(csv);
  const payload = toImportPayload(plan);

  it("recognizes 24 services, 9 inspection templates, 9 links, nothing to review", () => {
    expect(plan.summary).toMatchObject({
      servicesRecognized: 24,
      servicesImportable: 24,
      templatesImportable: 9,
      linksImportable: 9,
      reviewRequired: 0,
    });
    expect(plan.warnings).toEqual([]);
    expect(payload.services.filter((s) => s.template_key === null)).toHaveLength(15);
  });

  it("joins each canned job to its same-named inspection template by explicit template_name", () => {
    for (const svc of plan.services.filter((s) => s.templateKey)) {
      expect(svc.templateName).toBe(svc.name);
      expect(svc.linkSource).toBe("explicit");
    }
  });

  it("keeps pricing, labor and interval on the menu item", () => {
    const pm = payload.services.find((s) => s.service_code === "PM-HD");
    expect(pm).toMatchObject({ name: "Heavy-Duty PM Service", labor_hours: 3.5, price: 599, category: "Preventive Maintenance" });
    expect(pm?.description).toContain("Recommended interval: 25,000 km / 6 months");
    expect(payload.services.find((s) => s.service_code === "ROADSIDE-NOSTART")).toMatchObject({ labor_hours: 1, price: 349 });
  });

  it("builds runnable checklists with the right sections and item counts", () => {
    const byName = (n: string) => toInspectionCategories(payload.templates.find((t) => t.name === n)?.sections);
    const pm = byName("Heavy-Duty PM Service");
    expect(pm.map((c) => c.title)).toEqual(["Engine & Fluids", "Fuel & Aftertreatment", "Air & Brakes", "Chassis & Safety"]);
    expect(pm.reduce((n, c) => n + c.items.length, 0)).toBe(17);
    const annual = byName("Commercial Vehicle Annual Safety Inspection");
    expect(annual.map((c) => c.title)).toContain("Tires, Wheels & Lighting");
    // 15 listed lines; a line naming two things ("horn and warning lamps") becomes two items.
    expect(annual.reduce((n, c) => n + c.items.length, 0)).toBeGreaterThanOrEqual(15);
    for (const t of payload.templates) {
      expect(toInspectionCategories(t.sections).length).toBe(t.sections.length);
    }
  });

  it("maps usage context to the inspection vehicle vocabulary and keeps the original text", () => {
    const vt = Object.fromEntries(payload.templates.map((t) => [t.name, t.vehicle_type]));
    expect(vt["Heavy-Duty PM Service"]).toBe("truck");
    expect(vt["Trailer PM Service"]).toBe("trailer");
    expect(vt["Heavy Equipment Preventive Maintenance"]).toBeNull();
    expect(payload.templates.find((t) => t.name === "Trailer PM Service")?.usage_context).toBe("Commercial trailers");
  });
});

describe("service catalog parts (BOM)", () => {
  const csv = readFileSync(join(__dirname, "../__fixtures__/service-catalog-shop-reel-parts.csv"), "utf8");
  const plan = buildCatalogPlan(csv);
  const byCode = (code: string) => plan.services.find((s) => s.serviceCode === code);

  it("keeps the catalog counts and attaches parts to the right services", () => {
    expect(plan.summary).toMatchObject({ servicesRecognized: 24, templatesImportable: 9, linksImportable: 9, reviewRequired: 0 });
    expect(plan.summary.partsRecognized).toBe(11);
    expect(byCode("PM-HD")?.parts.map((p) => [p.partNumber, p.quantity])).toEqual([
      ["OIL-FILTER-HD", 1],
      ["FUEL-FILTER-HD", 2],
      ["AIR-FILTER-HD", 1],
      ["OIL-15W40", 12],
    ]);
    expect(byCode("PM-HD")?.templateName).toBe("Heavy-Duty PM Service");
    expect(byCode("FUEL-FILT")?.parts).toHaveLength(1);
  });

  it("shares a part across services and normalizes part numbers for matching", () => {
    expect(byCode("OIL-FILT")?.parts[0].partKey).toBe("OILFILTERHD");
    expect(byCode("PM-HD")?.parts[0].partKey).toBe(byCode("OIL-FILT")?.parts[0].partKey);
  });

  it("emits parts in the import payload keyed by service_key", () => {
    const payload = toImportPayload(plan);
    expect(payload.parts).toHaveLength(11);
    expect(payload.parts.filter((p) => p.service_key === "catalog:code:pm-hd")).toHaveLength(4);
  });

  it("skips bad parts with a warning instead of failing the service", () => {
    const bad = [
      "service_code,service_name,default_labor_hours,price,part_number,part_qty,part_name",
      "S-1,Service One,1,100,P-1,2,Part one",
      "S-1,Service One,1,100,P-2,0,Zero qty",
      "S-1,Service One,1,100,P-3,abc,Bad qty",
      "S-1,Service One,1,100,,1,No number",
      "S-1,Service One,1,100,P-1,5,Duplicate",
      ",,,,P-9,1,Orphan",
      "S-1,,,,P-4,3,Part-only row",
    ].join("\n");
    const result = buildCatalogPlan(bad);
    expect(result.services).toHaveLength(1);
    expect(result.services[0].parts.map((p) => [p.partKey, p.quantity])).toEqual([
      ["P1", 2],
      ["P4", 3],
    ]);
    expect(result.warnings.length).toBe(5);
  });

  it("defaults a missing quantity to 1 and ignores parts on services that need review", () => {
    const csv2 = [
      "service_code,service_name,default_labor_hours,part_number",
      "S-1,Has hours,1,P-1",
      "S-2,No pricing,,P-2",
    ].join("\n");
    const result = buildCatalogPlan(csv2);
    expect(result.services.find((s) => s.serviceCode === "S-1")?.parts[0].quantity).toBe(1);
    expect(result.services.find((s) => s.serviceCode === "S-2")?.parts).toEqual([]);
  });
});

function reel2(plan: ReturnType<typeof buildCatalogPlan>, original: string) {
  return plan.templates.flatMap((t) => t.sections.flatMap((sec) => sec.items)).find((i) => i.original === original);
}

describe("master inspection list mapping", () => {
  const reel = buildCatalogPlan(readFileSync(join(__dirname, "../__fixtures__/service-catalog-shop-reel.csv"), "utf8"));
  const payload = toImportPayload(reel);
  const tpl = (name: string) => payload.templates.find((t) => t.name === name);
  const itemsOf = (name: string) => tpl(name)?.sections.flatMap((sec) => sec.items) ?? [];

  it("adopts the master wording, unit and spec code for items that clearly match", () => {
    const brake = itemsOf("Brake System Inspection");
    expect(brake).toContainEqual({ item: "Brake shoes/linings", unit: "mm", specCode: "brake_lining_other", cvipCode: null });
    expect(brake).toContainEqual(expect.objectContaining({ item: "Governor cut-in / cut-out pressure", unit: "psi" }));
    expect(itemsOf("Steering & Suspension Inspection")).toContainEqual(
      expect.objectContaining({ item: "Steering wheel free play at rim", unit: "mm", specCode: "steering_freeplay_max" }),
    );
  });

  it("keeps section titles and every unmatched item exactly as the shop wrote them", () => {
    expect(tpl("Heavy-Duty PM Service")?.sections.map((s) => s.title)).toEqual([
      "Engine & Fluids",
      "Fuel & Aftertreatment",
      "Air & Brakes",
      "Chassis & Safety",
    ]);
    expect(itemsOf("Heavy-Duty PM Service")).toContainEqual({
      item: "Inspect fuel filter service condition",
      unit: null,
      specCode: null,
      cvipCode: null,
    });
  });

  it("never drops a line the shop listed: every line is represented by at least one item", () => {
    const { rows } = parseCatalogCsv(readFileSync(join(__dirname, "../__fixtures__/service-catalog-shop-reel.csv"), "utf8"));
    for (const t of reel.templates) {
      const represented = new Set(t.sections.flatMap((sec) => sec.items.map((i) => i.original)));
      const listed = new Set(rows.filter((r) => r.template_name === t.templateName && r.item).map((r) => r.item));
      for (const line of listed) expect(represented, `${t.templateName}: "${line}"`).toContain(line);
    }
  });

  it("does not collapse a multi-part line onto a master item that covers only part of it", () => {
    for (const line of [
      "Inspect brake chambers and slack adjusters",
      "Inspect windshield, mirrors and wipers",
      "Inspect headlamps, markers and turn signals",
      "Inspect springs, air bags and suspension mounts",
      "Inspect steering linkage and suspension",
    ]) {
      const items = reel.templates.flatMap((t) => t.sections.flatMap((sec) => sec.items)).filter((i) => i.original === line);
      // Either kept whole as the shop wrote it, or expanded so every part maps (never a single partial item).
      expect(items.length === 1 ? items[0].source : "expanded", line).toMatch(/custom|expanded/);
    }
  });

  it("maps hydraulic lines to hydraulic master items on equipment, never to engine items on a truck", () => {
    const eq = reel2(reel, "Check hydraulic oil level and condition");
    expect(eq).toMatchObject({ source: "master", item: "Hydraulic fluid level / condition" });
  });

  it("reports how many items were mapped, and never drops an item", () => {
    expect(reel.summary.checklistItemsFromMaster).toBeGreaterThanOrEqual(12);
    expect(reel.summary.checklistItems).toBe(reel.summary.checklistItemsFromMaster + reel.summary.checklistItemsCustom);
    for (const t of reel.templates) expect(t.itemCount).toBeGreaterThanOrEqual(t.mapping.listed);
  });

  it("does not map to a master item that adds a different concept", () => {
    const csv = [
      "service_code,service_name,default_labor_hours,template_name,section,item,usage_context",
      ...["Inspect air dryer operation", "Inspect fan and fan clutch operation", "Inspect belts and hoses", "Check DEF level and contamination indicators", "Inspect exhaust and aftertreatment clamps for leaks", "Review code A", "Review code B", "Review code C"].map(
        (it) => `S1,Svc,1,Truck check,Misc,${it},Heavy-duty trucks`,
      ),
    ].join("\n");
    const plan = buildCatalogPlan(csv);
    const sources = plan.templates[0].sections.flatMap((sec) => sec.items.map((i) => [i.original, i.source]));
    // The air dryer is its own master item; it must not be read as the compressor.
    const dryer = reel2(plan, "Inspect air dryer operation");
    expect(dryer).toMatchObject({ source: "master", item: "Air dryer/service status" });
    expect(dryer?.item).not.toMatch(/compressor/i);
    expect(sources.find(([o]) => o === "Inspect fan and fan clutch operation")?.[1]).toBe("custom");
    expect(sources.find(([o]) => o === "Inspect belts and hoses")?.[1]).toBe("custom");
  });

  it("uses a master item at most once per template", () => {
    const csv = [
      "service_code,service_name,default_labor_hours,template_name,section,item,usage_context",
      ...["Check wheel bearing play", "Inspect wheel bearing play", "Item three", "Item four", "Item five", "Item six", "Item seven", "Item eight"].map(
        (it) => `S1,Svc,1,Wheels,Misc,${it},Heavy-duty trucks`,
      ),
    ].join("\n");
    const items = buildCatalogPlan(csv).templates[0].sections.flatMap((sec) => sec.items);
    expect(items.filter((i) => i.item === "Wheel bearings/play")).toHaveLength(1);
    expect(items).toHaveLength(8);
  });

  it("splits a compound line into master items only when every part resolves", () => {
    const csv = [
      "service_code,service_name,default_labor_hours,template_name,section,item,usage_context",
      ...["Inspect drag link and tie rod ends", "Inspect windshield, mirrors and wipers", "Item three", "Item four", "Item five", "Item six", "Item seven", "Item eight"].map(
        (it) => `S1,Svc,1,Steering,Misc,"${it}",Heavy-duty trucks`,
      ),
    ].join("\n");
    const items = buildCatalogPlan(csv).templates[0].sections.flatMap((sec) => sec.items);
    expect(items.filter((i) => i.original === "Inspect drag link and tie rod ends").map((i) => i.item)).toEqual(["Drag link", "Tie rod ends"]);
    expect(items.filter((i) => i.original === "Inspect windshield, mirrors and wipers")).toEqual([
      expect.objectContaining({ item: "Inspect windshield, mirrors and wipers", source: "custom" }),
    ]);
  });

  it("keeps equipment-only master items out of highway templates", () => {
    const csv = [
      "service_code,service_name,default_labor_hours,template_name,section,item,usage_context",
      ...["Check hydraulic oil level and condition", "Item two", "Item three", "Item four", "Item five", "Item six", "Item seven", "Item eight"].map(
        (it) => `S1,Svc,1,Truck hydraulics,Misc,${it},Heavy-duty trucks`,
      ),
    ].join("\n");
    const items = buildCatalogPlan(csv).templates[0].sections.flatMap((sec) => sec.items);
    expect(items[0]).toMatchObject({ original: "Check hydraulic oil level and condition", source: "custom" });
  });

  it("builds a template from the master list when the CSV names it with inspection_source=master", () => {
    const csv = [
      "service_code,service_name,default_labor_hours,price,template_name,inspection_source,usage_context,brake_system,inspection_item_count",
      "CVIP-1,Annual CVIP,2,300,Annual CVIP Truck,master,Heavy-duty trucks and tractors,air,50",
    ].join("\n");
    const plan = buildCatalogPlan(csv);
    const t = plan.templates[0];
    expect(t.source).toBe("master");
    expect(t.needsReview).toBe(false);
    expect(t.itemCount).toBeGreaterThanOrEqual(40);
    expect(t.itemCount).toBeLessThanOrEqual(50);
    expect(t.mapping.fromMaster).toBe(t.itemCount);
    expect(plan.services[0].templateName).toBe("Annual CVIP Truck");
    const out = toImportPayload(plan).templates[0];
    expect(toInspectionCategories(out.sections).length).toBe(out.sections.length);
    expect(out.sections.flatMap((s) => s.items).some((i) => i.unit)).toBe(true);
  });

  it("flags a master-only template with no vehicle type instead of importing an empty checklist", () => {
    const csv = ["service_code,service_name,default_labor_hours,template_name", "X-1,Mystery,1,Mystery Inspection"].join("\n");
    const plan = buildCatalogPlan(csv);
    expect(plan.templates[0].needsReview).toBe(true);
    expect(plan.services[0].templateKey).toBeNull();
    expect(toImportPayload(plan).templates).toHaveLength(0);
  });
});
