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
          { item: "Front pads", status: "ok", value: "8 mm" },
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
  it("preserves technician evidence and recommendations", () => {
    const report = assembleInspectionReport(session());
    expect(report.sections[0].items[1]).toMatchObject({
      label: "Rear pads",
      status: "fail",
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
    });
  });

  it("assembles customer and vehicle headings", () => {
    const report = assembleInspectionReport(session());
    expect(report.customerName).toBe("Example Fleet");
    expect(report.vehicleLabel).toBe("2024 Ford F-550");
    expect(report.vin).toBe("TESTVIN");
  });
});
