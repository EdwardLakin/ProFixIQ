import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  FLEET_PRETRIP_DEFECT_STATUSES,
  fleetPretripDefectStatusIsDefect,
  isFleetPretripDefectStatus,
  normalizeFleetPretripTemplateSections,
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

  it("escalates only a major defect", () => {
    const route = read("app/api/fleet/pretrip/route.ts");

    // A minor defect still notifies dispatch and is flagged for review, but it
    // does not force a photo or take the unit out of service.
    expect(route).toContain(
      "requirePhoto: isMajor && Boolean(item.failureActions?.requirePhoto)",
    );
    expect(route).toContain(
      "isMajor && Boolean(item.failureActions?.markVehicleAttention)",
    );
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
