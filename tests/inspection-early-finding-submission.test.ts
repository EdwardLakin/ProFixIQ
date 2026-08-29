import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("inspection early finding submission", () => {
  it("uses a saved revision and the atomic finding submission", () => {
    const screen = read(
      "features/inspections/screens/GenericInspectionScreen.tsx",
    );
    const route = read("app/api/work-orders/import-from-inspection/route.ts");

    expect(screen).toContain("await flushAutosaveToServer()");
    expect(screen).toContain("expectedSyncRevision");
    expect(screen).toContain("findingSelection: selection");
    expect(screen).not.toContain("autoGenerateParts");
    expect(route).toContain("findingSelection");
    expect(route).toContain("inspection.sync_revision");
    expect(route).toContain("insertPrioritizedJobsFromInspection({");
    expect(route).toContain("expectedSyncRevision: findingSelection");
  });

  it("accepts only saved failed or recommended findings with complaint notes", () => {
    const route = read("app/api/work-orders/import-from-inspection/route.ts");

    expect(route).toContain('status !== "fail" && status !== "recommend"');
    expect(route).toContain("Only saved failed or recommended findings");
    expect(route).toContain("Add a note for ${title} before submitting.");
  });

  it("filters the canonical import to selected findings and reuses submitted line ids", () => {
    const importer = read(
      "features/work-orders/lib/work-orders/insertPrioritizedJobsFromInspection.ts",
    );

    expect(importer).toContain("selectedFindingKeys");
    expect(importer).toContain(
      "!selectedFindingKeys.has(`${sectionIndex}:${itemIndex}`)",
    );
    expect(importer).toContain(
      "id: safeString(item.estimateQuoteLineId) || null",
    );
    expect(importer).not.toContain("estimateLabor(");
    expect(importer).not.toContain("Auto-generated from inspection");
    expect(importer).toContain('"submit_inspection_findings_atomic"');
    expect(importer).toContain("p_expected_sync_revision");
  });

  it("persists the server line id and keeps signing as the final lock action", () => {
    const screen = read(
      "features/inspections/screens/GenericInspectionScreen.tsx",
    );
    const signature = read(
      "features/inspections/components/inspection/InspectionSignaturePanel.tsx",
    );

    expect(screen).toContain("replaceSession(json.session)");
    expect(screen).not.toContain("await flushAutosaveToServer(nextSession)");
    expect(screen).toContain("pendingPhotoKeysRef.current");
    expect(screen).toContain("submittingFindingKeysRef.current");
    expect(screen).toContain("The inspection stays open until it is signed.");
    expect(signature).toContain(
      "any remaining failed and recommended findings",
    );
  });

  it("keeps submitted and in-flight findings immutable in every UI path", () => {
    const screen = read(
      "features/inspections/screens/GenericInspectionScreen.tsx",
    );
    const section = read(
      "features/inspections/lib/inspection/SectionDisplay.tsx",
    );

    expect(screen).toContain(
      "findingIsSubmitted(it) || isSubmittingFinding(sectionIndex, itemIndex)",
    );
    expect(section).toContain("const lockInputs = submitted || submitting");
    expect(section).toContain("readOnly={lockInputs}");
  });

  it("defines one database transaction for quote creation and submission markers", () => {
    const migration = read(
      "supabase/migrations/20260828213203_submit_inspection_findings_atomically.sql",
    );

    expect(migration).toContain(
      "create or replace function public.submit_inspection_findings_atomic",
    );
    expect(migration).toContain("INSPECTION_REVISION_CONFLICT");
    expect(migration).toContain(
      "public.import_inspection_quote_package_atomic(",
    );
    expect(migration).toContain("'estimateSubmitted', true");
    expect(migration).toContain("'session', v_summary");
    const runtime = read(
      "tests/security/inspection-finding-submission.runtime.sql",
    );
    const cleanReplay = read(
      ".github/workflows/supabase-clean-replay-audit.yml",
    );
    expect(runtime).toContain(
      "No-parts or zero-quantity technician findings created a parts request.",
    );
    expect(runtime).toContain(
      "Exact finding submission retry was not idempotent.",
    );
    expect(runtime).toContain(
      "Stale inspection revision was accepted for finding submission.",
    );
    expect(cleanReplay).toContain(
      "-f tests/security/inspection-finding-submission.runtime.sql",
    );
  });
});
