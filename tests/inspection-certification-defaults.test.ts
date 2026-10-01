import { describe, expect, it } from "vitest";
import {
  pickInspectionLicenseNumber,
  shopStationLocation,
  shopStationName,
} from "@/features/inspections/lib/certificationDefaults";
import {
  certificationFieldKind,
  isSignaturePanelField,
} from "@/features/inspections/lib/form-import";

const TODAY = "2026-10-01";

describe("pickInspectionLicenseNumber", () => {
  it("prefers an inspection licence over other certifications", () => {
    expect(
      pickInspectionLicenseNumber(
        [
          { cert_name: "Welding", cert_number: "W-1", status: "active" },
          { cert_name: "CVIP Inspector", cert_number: "C0521", status: "active" },
        ],
        TODAY,
      ),
    ).toBe("C0521");
  });

  it("skips expired or inactive certifications", () => {
    expect(
      pickInspectionLicenseNumber(
        [
          { cert_name: "CVIP Inspector", cert_number: "OLD", expiry_date: "2025-01-01", status: "active" },
          { cert_name: "CVIP Inspector", cert_number: "OFF", status: "revoked" },
          { cert_name: "CVIP Inspector", cert_number: "NEW", expiry_date: "2027-01-01", status: "active" },
        ],
        TODAY,
      ),
    ).toBe("NEW");
  });

  it("uses a sole numbered certification but never guesses between several", () => {
    expect(
      pickInspectionLicenseNumber([{ cert_name: "Journeyman", cert_number: "J9", status: "active" }], TODAY),
    ).toBe("J9");
    expect(
      pickInspectionLicenseNumber(
        [
          { cert_name: "Welding", cert_number: "W-1", status: "active" },
          { cert_name: "Journeyman", cert_number: "J9", status: "active" },
        ],
        TODAY,
      ),
    ).toBeNull();
    expect(pickInspectionLicenseNumber([], TODAY)).toBeNull();
  });
});

describe("shop station defaults", () => {
  it("builds name and a single-line location", () => {
    expect(shopStationName({ business_name: " Hansen's ", shop_name: "x" })).toBe("Hansen's");
    expect(
      shopStationLocation({ address: "1 Main St", city: "Calgary", province: "AB", postal_code: "T2T 2T2" }),
    ).toBe("1 Main St, Calgary, AB, T2T 2T2");
    expect(shopStationLocation(null)).toBe("");
  });
});

describe("certification field recognition", () => {
  it.each([
    ["Date of Inspection", "inspectionDate"],
    ["Inspection Station Name", "stationName"],
    ["Inspection Station #", "stationNumber"],
    ["Inspection Station Location", "stationLocation"],
    ["License#", "licenseNumber"],
    ["Licence No.", "licenseNumber"],
    ["Odometer", null],
    ["Inspector License No.", "licenseNumber"],
    ["Driver Licence Number", null],
    ["Vehicle License", null],
    ["Carrier Licence #", null],
    ["Operator's License Class", null],
    ["License Plate", null],
  ])("%s -> %s", (label, kind) => {
    expect(certificationFieldKind(label)).toBe(kind);
  });

  it("recognises what the technician signature block already captures", () => {
    for (const label of ["Technician Name (Print)", "Technician Signature", "Inspector Name", "Technician"]) {
      expect(isSignaturePanelField(label)).toBe(true);
    }
  });

  it("leaves other people's sign-off lines and the certification fields alone", () => {
    for (const label of [
      "Driver's Name (Print)", "Driver's Signature", "Customer Signature", "Signature",
      "License#", "Date of Inspection", "Inspection Station Name",
    ]) {
      expect(isSignaturePanelField(label)).toBe(false);
    }
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("review-driven wiring", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  it("evaluates certification expiry in the shop's own timezone", () => {
    const route = read("app/api/inspections/certification-defaults/route.ts");
    expect(route).toContain("getShopScheduleDateContext");
    expect(route).toContain("timezone");
    expect(route).not.toContain("toISOString().slice(0, 10)");
  });

  it("applies certification defaults as one update", () => {
    const card = read("features/inspections/components/inspection/ImportedFormContextCard.tsx");
    const screen = read("features/inspections/screens/GenericInspectionScreen.tsx");
    expect(card).toContain("onChangeMany(updates)");
    expect(screen).toContain("updateFormContextValues");
    expect(screen).toContain("onChangeMany={updateFormContextValues}");
  });

  it("always saves the review before approving", () => {
    const review = read("features/inspections/components/InspectionFormImportReview.tsx");
    expect(review).toContain("if (!(await saveReview())) return;");
    expect(review).not.toContain("if (dirty && !(await saveReview())) return;");
  });

  it("keeps every captured line in the report data", () => {
    const report = read("features/inspections/lib/inspection/report.ts");
    expect(report).not.toContain("isSignaturePanelField");
  });
});

import { assembleInspectionReport } from "@/features/inspections/lib/inspection/report";
import {
  emptyInspectionFormContext,
  inspectionFormContextValueKey,
} from "@/features/inspections/lib/form-import";
import type { InspectionSession } from "@/features/inspections/lib/inspection/types";

describe("report data keeps captured signature-line values", () => {
  it("does not drop a captured Inspector Name from the report data", () => {
    const formContext = emptyInspectionFormContext();
    formContext.completion = [
      { title: "Certificate of Inspection", items: [{ item: "Inspector Name" }, { item: "License#" }] },
    ];
    const session = {
      templateName: "Quarterly",
      sections: [],
      formContext,
      formContextValues: {
        [inspectionFormContextValueKey("completion", 0, "Certificate of Inspection", "Inspector Name")]: "E. Lakin",
      },
    } as unknown as InspectionSession;

    const labels = assembleInspectionReport(session).formContext.flatMap((s) =>
      s.items.map((i) => [i.label, i.value] as const),
    );
    expect(labels).toContainEqual(["Inspector Name", "E. Lakin"]);
    expect(labels).toContainEqual(["License#", null]);
  });
});
