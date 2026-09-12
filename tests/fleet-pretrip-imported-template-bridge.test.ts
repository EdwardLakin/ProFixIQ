import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { adaptImportedTemplateForFleetPretrip } from "../features/fleet/lib/importedPretripTemplate";
import { selectFleetPretripTemplate } from "../features/fleet/server/loadFleetPretripContext";
import {
  DEFAULT_FLEET_PRETRIP_TEMPLATE,
  normalizeFleetPretripTemplateSections,
} from "../features/fleet/types/driverPortal";
import {
  INSPECTION_FORM_IMPORT_FORMAT_VERSION,
  selectRunnableInspectionFormSections,
} from "../features/inspections/lib/form-import";

const read = (path: string) => readFileSync(path, "utf8");

const calgary = JSON.parse(
  read("tests/fixtures/inspection-form-import/calgary-x505-ocr.json"),
) as { sections: unknown };

const calgaryTemplateSections = () =>
  selectRunnableInspectionFormSections(
    calgary.sections,
    INSPECTION_FORM_IMPORT_FORMAT_VERSION,
  );

describe("imported template to fleet pre-trip bridge", () => {
  it("adapts every runnable imported row into a driver-runnable item", () => {
    const { sections, droppedItems, droppedSections } =
      adaptImportedTemplateForFleetPretrip(calgaryTemplateSections());

    expect(droppedItems).toBe(0);
    expect(droppedSections).toBe(0);
    expect(sections.map((section) => section.title)).toEqual([
      "Defects Detected",
      "Indicate Brake Out of Adjustment (X)",
    ]);
    expect(
      sections.reduce((total, section) => total + section.items.length, 0),
    ).toBe(48);
  });

  it("produces items the fleet template validator accepts", () => {
    const { sections } = adaptImportedTemplateForFleetPretrip(
      calgaryTemplateSections(),
    );

    // The published shape has to survive the same normalizer the driver
    // runner uses, or drivers silently get a shorter checklist.
    const normalized = normalizeFleetPretripTemplateSections(sections);
    expect(normalized).toHaveLength(sections.length);
    expect(
      normalized.reduce((total, section) => total + section.items.length, 0),
    ).toBe(48);

    const ids = sections.flatMap((section) =>
      section.items.map((item) => item.id),
    );
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/);
    }
  });

  it("maps defect rows to pass/fail and measurements to numbers", () => {
    const items = adaptImportedTemplateForFleetPretrip(
      calgaryTemplateSections(),
    ).sections.flatMap((section) => section.items);

    const airBrake = items.find((item) => item.label === "1. Air Brake System");
    expect(airBrake?.type).toBe("pass_fail");
    expect(airBrake?.severity).toBe("safety");
    expect(airBrake?.failureActions).toMatchObject({
      notifyDispatcher: true,
      markVehicleAttention: true,
    });

    const pushRod = items.find(
      (item) => item.label === "Push Rod Travel Axle 1 Left",
    );
    expect(pushRod?.type).toBe("number");
  });

  it("keeps distinct ids for the nine lettered miscellaneous rows", () => {
    const misc = adaptImportedTemplateForFleetPretrip(calgaryTemplateSections())
      .sections.flatMap((section) => section.items)
      .filter((item) => item.label.startsWith("24. Miscellaneous"));

    expect(misc).toHaveLength(9);
    expect(new Set(misc.map((item) => item.id)).size).toBe(9);
  });

  it("gives every item a unique id even when labels repeat", () => {
    const { sections } = adaptImportedTemplateForFleetPretrip([
      {
        title: "Walk-around",
        items: [
          { item: "Brakes", fieldType: "defect" },
          { item: "Brakes", fieldType: "defect" },
          { item: "Brakes!", fieldType: "defect" },
        ],
      },
    ]);

    const ids = sections[0]?.items.map((item) => item.id) ?? [];
    expect(ids).toEqual(["Brakes", "Brakes-2", "Brakes-3"]);
  });

  it("publishes legacy rows that carry no field type", () => {
    // The review screen and the imported-template editor both fall back to
    // unit ? measurement : check for rows imported before field types were
    // recorded. Publishing has to agree, or a legacy template is rejected as
    // having no rows or silently publishes a shorter driver checklist.
    const { sections, droppedItems } = adaptImportedTemplateForFleetPretrip([
      {
        title: "Legacy checks",
        items: [
          { item: "Brakes" },
          { item: "Brake lining", unit: "mm" },
        ],
      },
    ]);

    expect(droppedItems).toBe(0);
    expect(sections[0]?.items.map((item) => [item.label, item.type])).toEqual([
      ["Brakes", "pass_fail"],
      ["Brake lining", "number"],
    ]);
    expect(sections[0]?.items[1]?.unit).toBe("mm");
  });

  it("drops nothing but non-runnable rows", () => {
    const { sections } = adaptImportedTemplateForFleetPretrip([
      {
        title: "Mixed",
        items: [
          { item: "Steering", fieldType: "defect" },
          { item: "Driver's Signature", fieldType: "signature" },
          { item: "Odometer Reading", fieldType: "identity" },
        ],
      },
    ]);

    expect(sections[0]?.items.map((item) => item.label)).toEqual(["Steering"]);
  });
});

describe("fleet pre-trip template resolution", () => {
  const assignment = (vehicleType: string, name: string) => ({
    id: `assignment-${vehicleType}`,
    inspection_template_id: `template-${vehicleType}`,
    vehicle_type: vehicleType,
    version: 3,
    inspection_templates: {
      template_name: name,
      sections: [
        {
          id: "walkaround",
          title: "Walk-around",
          items: [
            { id: "brakes", label: "Brakes", type: "pass_fail" },
          ],
        },
      ],
    },
  });

  it("prefers an exact vehicle-type assignment", () => {
    const template = selectFleetPretripTemplate(
      [assignment("all", "Fleet wide"), assignment("Tractor", "Tractor form")],
      "tractor",
    );
    expect(template.name).toBe("Tractor form");
    expect(template.version).toBe(3);
  });

  it("falls back to a fleet-wide assignment", () => {
    expect(
      selectFleetPretripTemplate([assignment("All fleet assets", "Fleet wide")], "Trailer")
        .name,
    ).toBe("Fleet wide");
  });

  it("reaches drivers when the import named a mixed fleet", () => {
    // The importer's uploader records a broad class (car, truck, bus, trailer,
    // mixed) while assignments match a vehicle's own asset_type/body_type. A
    // "mixed" assignment matched nothing, so publishing reported success while
    // every driver kept the built-in walk-around.
    expect(
      selectFleetPretripTemplate([assignment("mixed", "Imported form")], "Tractor")
        .name,
    ).toBe("Imported form");

    const route = read("app/api/fleet/pretrip/templates/from-import/route.ts");
    expect(route).toContain("MIXED_VEHICLE_TYPES");
    expect(route).toContain('"All fleet assets"');
  });

  it("uses the built-in walk-around only when nothing is published", () => {
    expect(selectFleetPretripTemplate([], "Tractor")).toBe(
      DEFAULT_FLEET_PRETRIP_TEMPLATE,
    );
    expect(selectFleetPretripTemplate(null, "Tractor")).toBe(
      DEFAULT_FLEET_PRETRIP_TEMPLATE,
    );
  });

  it("has both driver surfaces resolve the template the same way", () => {
    const mobile = read("app/mobile/fleet/pretrip/[unitId]/page.tsx");
    const portal = read("app/portal/fleet/pretrip/[unitId]/page.tsx");

    // The mobile page used to hardcode DEFAULT_FLEET_PRETRIP_TEMPLATE, so a
    // fleet running its own published form still saw the generic eight rows.
    expect(mobile).not.toContain("DEFAULT_FLEET_PRETRIP_TEMPLATE");
    expect(mobile).toContain("loadFleetPretripContext");
    expect(portal).toContain("loadFleetPretripContext");
    expect(mobile).toContain("template={context.template}");
  });

  it("publishes an approved import through the guarded fleet RPC", () => {
    const route = read("app/api/fleet/pretrip/templates/from-import/route.ts");
    expect(route).toContain("adaptImportedTemplateForFleetPretrip");
    expect(route).toContain("canAdministerFleetForActor");
    expect(route).toContain("save_fleet_pretrip_template");

    const review = read(
      "features/inspections/components/InspectionFormImportReview.tsx",
    );
    expect(review).toContain("/api/fleet/pretrip/templates/from-import");
  });
});
