import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_FLEET_PRETRIP_TEMPLATE,
  FLEET_PRETRIP_DEFECT_STATUSES,
  fleetPretripDefectStatusIsDefect,
  isFleetPretripDefectStatus,
  normalizeFleetPretripTemplateSections,
  toPersistedFleetPretripSections,
} from "../features/fleet/types/driverPortal";

const read = (path: string) => readFileSync(path, "utf8");

describe("fleet pre-trip defect classification", () => {
  it("answers a defect row the way a trip-inspection form asks", () => {
    expect([...FLEET_PRETRIP_DEFECT_STATUSES]).toEqual([
      "ok",
      "minor",
      "major",
      "na",
    ]);
    expect(isFleetPretripDefectStatus("minor")).toBe(true);
    expect(isFleetPretripDefectStatus("major")).toBe(true);
    // "defect" is the pass/fail vocabulary, not a defect-row classification.
    expect(isFleetPretripDefectStatus("defect")).toBe(false);
    expect(isFleetPretripDefectStatus("")).toBe(false);
  });

  it("counts both minor and major as defects", () => {
    expect(fleetPretripDefectStatusIsDefect("minor")).toBe(true);
    expect(fleetPretripDefectStatusIsDefect("major")).toBe(true);
    expect(fleetPretripDefectStatusIsDefect("ok")).toBe(false);
    expect(fleetPretripDefectStatusIsDefect("na")).toBe(false);
  });

  it("persists a defect row in a shape an older reader still runs", () => {
    const persisted = toPersistedFleetPretripSections([
      {
        id: "defects",
        title: "Defects Detected",
        items: [
          {
            id: "air-brake",
            item: "Air Brake System",
            label: "Air Brake System",
            type: "defect",
            required: true,
            unit: null,
            severity: "safety",
            failureActions: {
              notifyDispatcher: true,
              flagForReview: true,
              requirePhoto: true,
              markVehicleAttention: true,
            },
          },
        ],
      },
    ]);

    // Stored as pass_fail so a reader that predates the defect type renders the
    // row instead of dropping it. Dropping every row of an all-defect import
    // would fall back to the built-in walk-around and record that as the
    // fleet's compliance pre-trip.
    expect(persisted[0]?.items[0]?.type).toBe("pass_fail");
    expect(persisted[0]?.items[0]?.defectClassification).toBe(true);

    // The database save function only accepts these four stored types.
    const saveFn = read(
      "supabase/migrations/20260806164259_fleet_driver_dispatch_portals.sql",
    );
    expect(saveFn).toContain(
      "not in ('pass_fail', 'number', 'photo', 'voice')",
    );
    expect(persisted[0]?.items[0]?.type).toBe("pass_fail");
  });

  it("reads the stored row back as a classified defect row", () => {
    const sections = normalizeFleetPretripTemplateSections([
      {
        id: "defects",
        title: "Defects Detected",
        items: [
          {
            id: "air-brake",
            label: "Air Brake System",
            type: "pass_fail",
            defectClassification: true,
          },
        ],
      },
    ]);
    expect(sections[0]?.items[0]?.type).toBe("defect");
    expect(sections[0]?.items[0]?.defectClassification).toBe(true);

    // A row an older template stored as plain pass_fail stays pass_fail.
    const plain = normalizeFleetPretripTemplateSections([
      {
        id: "walkaround",
        title: "Walk-around",
        items: [{ id: "brakes", label: "Brakes", type: "pass_fail" }],
      },
    ]);
    expect(plain[0]?.items[0]?.type).toBe("pass_fail");
    expect(plain[0]?.items[0]?.defectClassification).toBeUndefined();

    // The built-in template is unaffected.
    expect(DEFAULT_FLEET_PRETRIP_TEMPLATE.sections[0]?.items[0]?.type).toBe(
      "pass_fail",
    );
  });

  it("routes both publish paths through the persisted shape", () => {
    expect(read("app/api/fleet/pretrip/templates/route.ts")).toContain(
      "toPersistedFleetPretripSections(",
    );
    expect(
      read("app/api/fleet/pretrip/templates/from-import/route.ts"),
    ).toContain("p_sections: toPersistedFleetPretripSections(sections)");
  });

  it("accepts defect rows through the template normalizer and validator", () => {
    const sections = normalizeFleetPretripTemplateSections([
      {
        id: "defects",
        title: "Defects Detected",
        items: [{ id: "air-brake", label: "Air Brake System", type: "defect" }],
      },
    ]);
    expect(sections[0]?.items[0]?.type).toBe("defect");

    // The publish validator has to allow the type too, or a published template
    // silently loses every defect row on its way to drivers.
    expect(read("app/api/fleet/pretrip/templates/route.ts")).toContain(
      '"voice", "defect"',
    );
  });

  it("maps minor and major into the existing defect vocabulary", () => {
    const route = read("app/api/fleet/pretrip/route.ts");

    // The report's defect count, the dispatch intake trigger and the
    // fleet_unit_defects rows all key off checklist.defects[id] === "defect".
    // Minor and major must both land there or a classified defect would never
    // reach dispatch at all.
    expect(route).toContain(
      'defects[item.id] = isDefect ? "defect" : status === "na" ? "na" : "ok";',
    );
    expect(route).toContain("defectClassification: status");
  });

  it("grounds a unit on any major defect and never on a minor one", () => {
    const route = read("app/api/fleet/pretrip/route.ts");

    // A major defect is out of service by definition. The fleet tower and the
    // unit list both filter fleet_unit_defects on marks_vehicle_attention, so
    // a template flag must not be able to withhold it from a major defect and
    // leave a grounded unit reading as in service.
    expect(route).toContain(
      "isMajor || Boolean(item.failureActions?.markVehicleAttention)",
    );
    expect(read("app/api/fleet/tower/route.ts")).toContain(
      '.eq("marks_vehicle_attention", true)',
    );
    expect(read("app/api/fleet/units/route.ts")).toContain(
      '.eq("marks_vehicle_attention", true)',
    );

    // A minor defect still reaches dispatch and review, but does not force a
    // photo.
    expect(route).toContain(
      "requirePhoto: isMajor && Boolean(item.failureActions?.requirePhoto)",
    );
  });

  it("drops the major-only photo when the driver reclassifies", () => {
    const form = read("features/fleet/components/PretripForm.tsx");

    // The photo control only shows for a major defect, so leaving major has to
    // drop the file rather than silently uploading it onto a minor or clear
    // report.
    expect(form).toContain('if (choice.value !== "major") {');
    expect(form).toContain('replaceItemEvidence(item.id, "photo", null);');
  });

  it("gives the driver a four-way control and counts defects in the summary", () => {
    const form = read("features/fleet/components/PretripForm.tsx");

    expect(form).toContain("DEFECT_CHOICES");
    expect(form).toContain('{ value: "minor", label: "Minor" }');
    expect(form).toContain('{ value: "major", label: "Major" }');
    expect(form).toContain("defect classification");
    // A minor or major answer has to show up in the driver's own defect
    // summary, not just in the submitted payload.
    expect(form).toContain('status === "minor" || status === "major"');
  });

  it("lets a manager author a defect row directly", () => {
    const builder = read(
      "features/fleet/components/FleetPretripTemplateBuilder.tsx",
    );
    expect(builder).toContain('<option value="defect">Minor / major defect');
    expect(builder).toContain('addItem(section.id, "defect")');
    expect(builder).toContain('item.type === "pass_fail" || item.type === "defect"');
  });
});
