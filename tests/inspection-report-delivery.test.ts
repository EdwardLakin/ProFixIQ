import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("inspection report delivery contracts", () => {
  it("uses stable application URLs rather than persisted signed URLs", () => {
    expect(
      source("features/inspections/server/publishInspectionPdf.ts"),
    ).toContain("/api/inspections/${args.inspectionId}/report/pdf");
  });

  it("authorizes report reads before service-role storage access", () => {
    const route = source("app/api/inspections/[id]/report/pdf/route.ts");
    expect(route).toContain("auth.getUser()");
    expect(route.indexOf("getInspectionReportForActor")).toBeLessThan(
      route.indexOf("createSignedUrl"),
    );
  });

  it("attaches every finalized inspection when an invoice is issued", () => {
    const route = source("app/api/invoices/send/route.ts");
    expect(route).toContain("attachInspectionReportToInvoice");
    expect(
      source(
        "features/invoices/server/attachInspectionReportToInvoice.ts",
      ),
    ).toContain('kind: "inspection_report"');
  });

  it("publishes the report from both completion entry points", () => {
    expect(source("app/api/inspections/finalize/pdf/route.ts")).toContain(
      "publishInspectionPdf",
    );
    expect(source("app/api/inspections/sign/route.ts")).toContain(
      "publishInspectionPdf",
    );
  });

  it("exposes reports in customer and fleet portal routes", () => {
    expect(
      source("app/portal/work-orders/view/[id]/layout.tsx"),
    ).toContain("InspectionReportAttachments");
    expect(
      source("app/portal/fleet/units/[unitId]/page.tsx"),
    ).toContain("InspectionReportAttachments");
  });
});
