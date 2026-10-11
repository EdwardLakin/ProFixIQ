import { describe, expect, it } from "vitest";

import { inspectionSectionsRequireEquipment } from "@/features/equipment/lib/equipmentInspectionContent";

describe("Equipment inspection content classification", () => {
  it("detects canonical off-road content after the section title is renamed", () => {
    expect(
      inspectionSectionsRequireEquipment([
        {
          title: "Hydraulics",
          items: [{ item: "Hydraulic pump condition" }],
        },
      ]),
    ).toBe(true);
  });

  it("detects preserved off-road provenance after item labels are edited", () => {
    expect(
      inspectionSectionsRequireEquipment([
        {
          title: "Hydraulics",
          items: [
            {
              item: "Main pump",
              catalogScope: "off_road",
              equipmentFamilies: ["excavation"],
            },
          ],
        },
      ]),
    ).toBe(true);
  });

  it("does not classify ordinary road/custom sections as Equipment", () => {
    expect(
      inspectionSectionsRequireEquipment([
        {
          title: "Brakes",
          items: [{ item: "Inspect brake hoses" }],
        },
      ]),
    ).toBe(false);
  });
});
