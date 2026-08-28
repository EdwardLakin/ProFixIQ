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
    const access = source(
      "features/inspections/server/inspectionReportAccess.ts",
    );
    expect(access).toContain('.from("work_order_media")');
    expect(access).toContain('.eq("storage_bucket", "job-photos")');
    expect(access).toContain("canonicalObjects.has");
  });

  it("keeps dispatchers inside fleet authorization", () => {
    expect(
      source("features/inspections/server/inspectionReportAccess.ts"),
    ).toContain('"dispatcher"');
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

  it("attaches the signed report with the authenticated signing actor", () => {
    const route = source("app/api/inspections/sign/route.ts");
    const helperStart = route.indexOf(
      "async function callAttachSignedPdfRpc",
    );
    const helperEnd = route.indexOf(
      "async function resolveInspectionForSigning",
    );
    const helper = route.slice(helperStart, helperEnd);

    expect(helperStart).toBeGreaterThan(-1);
    expect(helperEnd).toBeGreaterThan(helperStart);
    expect(helper).toContain("client: Supabase");
    expect(helper).not.toContain("createAdminClient()");
    expect(route).toContain("callAttachSignedPdfRpc(supabase, {");
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
    expect(route).toContain("hasAnyRole(profile?.role, ROLE_GROUPS.billingOperators)");
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
