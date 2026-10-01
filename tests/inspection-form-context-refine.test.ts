import { describe, expect, it } from "vitest";
import {
  refineInspectionFormContext,
  emptyInspectionFormContext,
  type InspectionFormContext,
} from "@/features/inspections/lib/form-import";

// What the importer produced for the Hansen's paper form: the certificate's
// fields were split by role, and page furniture became "fields".
function hansens(): InspectionFormContext {
  const c = emptyInspectionFormContext();
  c.branding = [{ title: "HANSEN'S", items: [{ item: "HANSEN'S" }, { item: "Vehicle Relocation" }] }];
  c.header = [
    { title: "Trip and vehicle record", items: [{ item: "DATE" }, { item: "TRACTOR #" }, { item: "VIN#" }] },
    { title: "Issued By", items: [{ item: "Issued By: Fleet Manager", fieldType: "identity" }] },
    {
      title: "Certificate of Inspection",
      items: [
        { item: "Date of Inspection", fieldType: "identity" },
        { item: "Inspection Station Name", fieldType: "identity" },
        { item: "Inspection Station #", fieldType: "identity" },
        { item: "Inspection Station Location", fieldType: "identity" },
        { item: "License#", fieldType: "identity" },
      ],
    },
    { title: "Page 2 of 2", items: [{ item: "Page 2 of 2" }] },
    { title: "Page 1 of 2", items: [{ item: "Page 1 of 2" }, { item: "Pass / Fail / N/A" }] },
  ];
  c.notices = [{ title: "Tire tread depth & pressure", items: [{ item: "LEFT SIDE" }, { item: "RIGHT SIDE" }] }];
  c.completion = [
    {
      title: "Certificate of Inspection",
      items: [
        { item: "Technician Name (Print)", fieldType: "signature" },
        { item: "Technician Signature", fieldType: "signature" },
      ],
    },
  ];
  return c;
}

describe("refineInspectionFormContext", () => {
  const out = refineInspectionFormContext(hansens());
  const labels = (block: keyof InspectionFormContext) =>
    out[block].flatMap((s) => s.items.map((i) => i.item));

  it("moves the whole certificate to the end, as one block", () => {
    expect(out.completion).toHaveLength(1);
    expect(out.completion[0].title).toBe("Certificate of Inspection");
    // Printed order: the station/licence lines, then the sign-off lines.
    expect(labels("completion")).toEqual([
      "Date of Inspection",
      "Inspection Station Name",
      "Inspection Station #",
      "Inspection Station Location",
      "License#",
      "Technician Name (Print)",
      "Technician Signature",
    ]);
    expect(labels("header")).not.toContain("License#");
  });

  it("drops page markers, legends and grid headings", () => {
    const all = [
      ...labels("header"), ...labels("notices"), ...labels("notes"),
      ...labels("completion"), ...labels("branding"),
    ];
    for (const noise of ["Page 1 of 2", "Page 2 of 2", "Pass / Fail / N/A", "LEFT SIDE", "RIGHT SIDE"]) {
      expect(all).not.toContain(noise);
    }
    expect(out.notices).toHaveLength(0);
  });

  it("treats 'Issued By' as branding and keeps the vehicle record", () => {
    expect(labels("branding")).toContain("Issued By: Fleet Manager");
    expect(labels("header")).toEqual(["DATE", "TRACTOR #", "VIN#"]);
  });

  it("is idempotent", () => {
    expect(refineInspectionFormContext(out)).toEqual(out);
  });

  it("does not collapse same-titled sections whose labels collide", () => {
    const c = emptyInspectionFormContext();
    c.header = [{ title: "Certificate of Inspection", items: [{ item: "Date" }] }];
    c.completion = [{ title: "Certificate of Inspection", items: [{ item: "Date" }] }];
    expect(refineInspectionFormContext(c).completion).toHaveLength(2);
  });
});
