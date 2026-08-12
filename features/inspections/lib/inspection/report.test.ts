import { describe, expect, it } from "vitest";
import { assembleInspectionReport } from "./report";
import type { InspectionSession } from "./types";

function session(): InspectionSession {
  return {
    templateName: "Annual vehicle inspection",
    currentSectionIndex: 0,
    currentItemIndex: 0,
    isListening: false,
    status: "completed",
    started: true,
    completed: true,
    isPaused: false,
    customer: {
      business_name: "Example Fleet",
      first_name: null,
      last_name: null,
      phone: null,
      email: null,
      address: null,
      city: null,
      province: null,
      postal_code: null,
    },
    vehicle: {
      year: "2024",
      make: "Ford",
      model: "F-550",
      vin: "TESTVIN",
      license_plate: null,
      mileage: "42,000 km",
      color: null,
    },
    sections: [
      {
        title: "Brakes",
        items: [
          { item: "Front pads", status: "ok", value: "8", unit: "mm" },
          {
            item: "Rear pads",
            status: "fail",
            notes: "Below service limit",
            recommend: ["Replace rear pads"],
            photoUrls: ["https://example.test/evidence.jpg"],
          },
          { item: "Parking brake", status: "na" },
          { item: "Brake fluid", status: "recommend" },
          { item: "Lines" },
        ],
      },
    ],
  };
}

describe("assembleInspectionReport", () => {
  it("preserves technician evidence, measurements and recommendations", () => {
    const report = assembleInspectionReport(session());
    expect(report.sections[0].items[0]).toMatchObject({
      label: "Front pads",
      status: "ok",
      statusLabel: "Pass",
      value: "8",
      unit: "mm",
    });
    expect(report.sections[0].items[1]).toMatchObject({
      label: "Rear pads",
      status: "fail",
      statusLabel: "Needs attention",
      note: "Below service limit",
      recommendations: ["Replace rear pads"],
      photoUrls: ["https://example.test/evidence.jpg"],
    });
  });

  it("calculates status totals without inventing unchecked results", () => {
    expect(assembleInspectionReport(session()).totals).toEqual({
      checked: 4,
      ok: 1,
      failed: 1,
      recommended: 1,
      notApplicable: 1,
      defectItems: 0,
      noDefect: 0,
      majorDefects: 0,
      minorDefects: 0,
    });
  });

  it("preserves imported minor and major defect semantics", () => {
    const source = session();
    source.sections = [
      {
        title: "Defect checklist",
        items: [
          { item: "Steering", status: "ok", fieldType: "defect" },
          { item: "Suspension", status: "fail", fieldType: "defect" },
          { item: "Tires", status: "recommend", fieldType: "defect" },
          { item: "Wipers", status: "na", fieldType: "defect" },
        ],
      },
    ] as unknown as InspectionSession["sections"];

    const report = assembleInspectionReport(source);
    expect(report.sections[0].items.map((item) => item.statusLabel)).toEqual([
      "No defect",
      "Major defect",
      "Minor defect",
      "Not applicable",
    ]);
    expect(report.totals).toMatchObject({
      defectItems: 4,
      noDefect: 1,
      majorDefects: 1,
      minorDefects: 1,
    });
  });

  it("assembles customer and vehicle headings", () => {
    const report = assembleInspectionReport(session());
    expect(report.customerName).toBe("Example Fleet");
    expect(report.vehicleLabel).toBe("2024 Ford F-550");
    expect(report.vin).toBe("TESTVIN");
  });
});
