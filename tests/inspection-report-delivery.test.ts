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

  it("anchors evidence signing to canonical job-photo rows", () => {
    const signer = source(
      "features/inspections/server/signCanonicalWorkOrderPhotoUrls.ts",
    );
    expect(signer).toContain('.from("work_order_media")');
    expect(signer).toContain('.eq("storage_bucket", "job-photos")');
    expect(signer).toContain("canonicalPaths.has");
    expect(signer).toContain('.eq("visibility", "customer")');
    expect(
      source("features/inspections/server/inspectionReportAccess.ts"),
    ).toContain('customerVisibleOnly: actorKind === "portal"');
    expect(
      source("features/inspections/server/publishInspectionPdf.ts"),
    ).toContain("signCanonicalWorkOrderPhotoUrls");
  });

  it("keeps dispatchers inside fleet authorization", () => {
    expect(
      source("features/inspections/server/inspectionReportAccess.ts"),
    ).toContain('"dispatcher"');
  });

  it("binds every service-role report read to active portal access first", () => {
    const access = source(
      "features/inspections/server/inspectionReportAccess.ts",
    );
    const page = source("app/inspection-reports/[id]/page.tsx");
    const pdfRoute = source("app/api/inspections/[id]/report/pdf/route.ts");
    const listRoute = source("app/api/inspections/reports/route.ts");

    expect(access).toContain(
      'args.sessionClient.rpc("profixiq_is_portal_customer_for"',
    );
    expect(access).not.toContain('.from("customers")');
    for (const caller of [page, pdfRoute, listRoute]) {
      expect(caller).toContain("sessionClient: supabase");
    }
    expect(pdfRoute.indexOf("getInspectionReportForActor")).toBeLessThan(
      pdfRoute.indexOf("const admin = createAdminClient()"),
    );
  });

  it("labels technicians from current-cycle technician signatures", () => {
    const access = source(
      "features/inspections/server/inspectionReportAccess.ts",
    );
    expect(access).toContain('.from("inspection_signatures")');
    expect(access).toContain('.eq("role", "technician")');
    expect(access).toContain('.eq("signing_cycle"');
  });

  it("preserves already-signed conflicts", () => {
    const route = source("app/api/inspections/sign/route.ts");
    expect(route).toContain("if (error) {");
    expect(route).not.toContain(
      'error && !error.message.toLowerCase().includes("already signed")',
    );
  });

  it("uses the authenticated identity for invoice document ownership", () => {
    expect(source("app/api/invoices/send/route.ts")).toContain(
      "actorUserId: access.authUserId",
    );
  });

  it("limits invoice documents to billing roles and canonical paths", () => {
    const route = source(
      "app/api/invoices/[id]/documents/[kind]/signed/route.ts",
    );
    expect(route).toContain(
      "hasAnyRole(profile?.role, ROLE_GROUPS.billingOperators)",
    );
    expect(route).toContain("isExpectedDocumentStorage");
    expect(route).toContain('args.bucket !== "inspection_pdfs"');
  });

  it("bounds synchronous inspection report consolidation", () => {
    const service = source(
      "features/invoices/server/attachInspectionReportToInvoice.ts",
    );
    expect(service).toContain("MAX_INSPECTION_REPORTS");
    expect(service).toContain("MAX_COMBINED_INPUT_BYTES");
    expect(service).toContain("MAX_COMBINED_OUTPUT_BYTES");
  });

  it("renders the selected invoice attachment rather than live work-order reports", () => {
    expect(source("app/portal/invoices/[id]/page.tsx")).toContain(
      "invoiceId={selectedVersion.invoice_id}",
    );
    expect(source("app/portal/invoices/[id]/layout.tsx")).not.toContain(
      "InspectionReportAttachments",
    );
  });

  it("renders unsupported Unicode safely with standard PDF fonts", () => {
    const pdf = source("features/inspections/lib/inspection/pdf.ts");
    expect(pdf).toContain("function pdfSafeText");
    expect(pdf).toContain("font.encodeText(character)");
  });

  it("hardens report attachment and reopen lifecycle in a forward migration", () => {
    const migration = source(
      "supabase/migrations/20260729205000_inspection_report_review_hardening.sql",
    );
    expect(migration).toContain("INSPECTION_REPORT_PATH_MISMATCH");
    expect(migration).toContain("inspection_signatures");
    expect(migration).toContain("clear_reopened_inspection_report");
    expect(migration).toContain("linked.finalized_at");
  });
});
