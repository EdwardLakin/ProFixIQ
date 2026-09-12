import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  INSPECTION_FORM_IMPORT_FORMAT_VERSION,
  normalizeInspectionFormSectionsV2,
  selectRunnableInspectionFormSections,
} from "../features/inspections/lib/form-import";

/**
 * Golden contract for the City of Calgary X 505 (R2024-10) Operator's Vehicle
 * Trip Inspection Report. The paper form this fixture was transcribed from is
 * committed beside it as calgary-x505.jpg, so the recorded structural-OCR
 * result can be re-derived by hand against a live vision run when the prompt in
 * inspection-form-import-job.ts changes.
 *
 * The point of the fixture is that importer shaping is pinned to a real
 * multi-block commercial form — header, regulatory declaration, defect
 * checklist, brake-adjustment grid, completion and signature blocks — instead
 * of only to synthetic rows.
 */
const fixture = JSON.parse(
  readFileSync(
    resolve(
      __dirname,
      "fixtures/inspection-form-import/calgary-x505-ocr.json",
    ),
    "utf8",
  ),
) as { sections: unknown };

describe("Calgary X505 trip inspection import", () => {
  it("accepts the recorded page under the strict V2 OCR contract", () => {
    expect(normalizeInspectionFormSectionsV2(fixture.sections)).not.toBeNull();
  });

  const runnable = () =>
    selectRunnableInspectionFormSections(
      fixture.sections,
      INSPECTION_FORM_IMPORT_FORMAT_VERSION,
    );

  it("keeps every checkable defect row on the form", () => {
    const defects = runnable()
      .flatMap((section) => section.items)
      .filter((item) => item.fieldType === "defect")
      .map((item) => item.item);

    // 23 numbered categories plus the nine lettered rows under 24.
    // Miscellaneous. All of them are marked on the paper form, so all of them
    // have to survive as individually markable digital rows.
    expect(defects).toHaveLength(32);
    expect(defects[0]).toBe("1. Air Brake System");
    expect(defects[22]).toBe("23. Windshield Wipers/Washer");
    expect(defects).toContain("24. Miscellaneous a) All Fluid Levels Under the Hood");
    expect(defects).toContain("24. Miscellaneous i) Spill Kit");
  });

  it("keeps the brake-adjustment grid as per-wheel push-rod measurements", () => {
    const measurements = runnable()
      .flatMap((section) => section.items)
      .filter((item) => item.fieldType === "measurement")
      .map((item) => item.item);

    // The imported template schema has no axle matrix, so the 8x2 printed grid
    // has to survive as one measurement row per wheel end or the data is lost.
    expect(measurements).toHaveLength(16);
    expect(measurements).toContain("Push Rod Travel Axle 1 Left");
    expect(measurements).toContain("Push Rod Travel Axle 8 Right");
  });

  it("keeps the printed section order and titles", () => {
    expect(runnable().map((section) => section.title)).toEqual([
      "Defects Detected",
      "Indicate Brake Out of Adjustment (X)",
    ]);
  });

  it("never turns header, declaration, or signature content into checklist rows", () => {
    const serialized = JSON.stringify(runnable());

    for (const excluded of [
      "Carrier Name",
      "Odometer Reading Start",
      "Hour Meter Start",
      "Unit Number",
      "Location of Inspection",
      "Time of Inspection",
      "No Defects Found During Pre-Trip Inspection.",
      "Commercial Vehicle Safety Regulation",
      "Driver's Signature",
      "Mechanic's Signature",
      "Work Order #",
      "Employee Number",
      "DRIVER'S COPY",
    ]) {
      expect(serialized).not.toContain(excluded);
    }
  });
});
