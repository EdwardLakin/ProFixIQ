import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const migration = read(
  "supabase/migrations/20260721160000_inspection_live_autosave_signature_hardening.sql",
);
const autosave = read("features/inspections/hooks/useInspectionAutosave.ts");
const loadRoute = read("app/api/inspections/load/route.ts");
const signRoute = read("app/api/inspections/sign/route.ts");
const signaturePanel = read(
  "features/inspections/components/inspection/InspectionSignaturePanel.tsx",
);
const finalizeRoute = read("app/api/inspections/finalize/pdf/route.ts");
const findings = read("features/inspections/lib/inspection/findings/page.tsx");
const desktopSettings = read("app/dashboard/tech/settings/page.tsx");
const mobileSettings = read(
  "features/mobile/settings/MobileSettingsScreen.tsx",
);
const screens = [
  read("features/inspections/screens/GenericInspectionScreen.tsx"),
  read("features/inspections/screens/QuickPMScreen.tsx"),
  read("features/inspections/screens/QuickAirBrakePMScreen.tsx"),
  read("features/inspections/components/inspection/InspectionReviewPanel.tsx"),
];

describe("inspection live autosave and saved signatures", () => {
  it("repairs draft lifecycle fields and saves without line uniqueness", () => {
    expect(migration).toContain("Normalize drifted lifecycle rows");
    expect(migration).toContain("finalized_at = null");
    expect(migration).toContain("finalized_by = null");
    expect(migration).toContain(
      "create or replace function public.save_inspection_progress_atomic",
    );
    expect(migration).toContain("'syncRevision', v_next_revision");
    expect(migration).toContain(
      "Inspection save conflicts with a newer server version.",
    );
    expect(migration).not.toContain("on conflict (work_order_line_id)");
  });

  it("hydrates the canonical line and streams server changes to open devices", () => {
    const lineLookup = loadRoute.indexOf(
      '.eq("work_order_line_id", workOrderLineId)',
    );
    const idLookup = loadRoute.indexOf('.eq("id", inspectionId)');
    expect(lineLookup).toBeGreaterThan(-1);
    expect(idLookup).toBeGreaterThan(lineLookup);
    expect(loadRoute).toContain("locked: Boolean(inspectionRow?.locked)");
    expect(autosave).toContain('"postgres_changes"');
    expect(autosave).toContain('table: "inspections"');
    expect(autosave).toContain("remoteShouldReplace");
    expect(migration).toContain(
      "alter publication supabase_realtime add table",
    );
    expect(migration).toContain(
      "alter table public.inspections replica identity full",
    );
  });

  it("autosaves every active inspection surface and removes manual save controls", () => {
    for (const screen of screens) {
      expect(screen).toContain("useInspectionAutosave");
      expect(screen).not.toContain("<SaveInspectionButton");
      expect(screen).not.toContain("import { SaveInspectionButton }");
    }
    expect(screens[0]).toContain("beforeSign={() => flushAutosaveToServer()}");
    expect(screens[0]).toContain(
      "beforeNavigate={() => flushAutosaveToServer()}",
    );
    expect(findings).toContain("await flushAutosaveToServer(nextSession)");
    expect(autosave).toContain("flushToServer");
    expect(autosave).toContain("A signing/finalization flush is a barrier");
    expect(autosave).toContain("maxBarrierPasses");
    expect(autosave).toContain("requireServer");
    expect(autosave).toContain("pendingOperationFingerprintRef");
    expect(migration).toContain("'session_fingerprint'");
    expect(findings).toContain("lastUpdated: new Date().toISOString()");
  });

  it("uses authenticated profile signature evidence without an invalid conflict target", () => {
    expect(signRoute).toContain("tech_signature_path");
    expect(signRoute).toContain("tech_signature_hash");
    expect(signRoute).toContain("profileName(profile)");
    expect(signaturePanel).toContain("const prepared = await beforeSign()");
    expect(signaturePanel).toContain("expectedSyncRevision");
    expect(signaturePanel).not.toContain("/api/profile/signature");
    expect(signaturePanel).not.toContain("signatureImagePath");
    expect(migration).toContain(
      "create or replace function public.sign_inspection",
    );
    expect(migration).toContain("from public.inspection_signatures s");
    expect(migration).not.toContain("update public.inspection_signatures");
    expect(migration).not.toContain("on conflict (inspection_id, role)");
  });

  it("keeps signature files immutable and finalizes the autosaved row deterministically", () => {
    expect(desktopSettings).toContain(
      "tech-signatures/${profileId}/${hash}.png",
    );
    expect(mobileSettings).toContain(
      "tech-signatures/${profileId}/${hash}.png",
    );
    expect(finalizeRoute).toContain(
      "Inspection has not finished autosaving yet",
    );
    expect(finalizeRoute).toContain(
      '.order("updated_at", { ascending: false, nullsFirst: false })',
    );
    expect(desktopSettings).toContain("upsert: false");
    expect(mobileSettings).toContain("upsert: false");
    expect(migration).toContain("prevent_technician_signature_mutation");
    expect(migration).toContain("signed_sync_revision");
    expect(migration).toContain("signed_summary");
    expect(migration).toContain("extensions.digest");
    expect(migration).toContain(
      "create or replace function public.finalize_inspection_pdf_atomic",
    );
    expect(finalizeRoute).toContain('createHash("sha256")');
    expect(finalizeRoute).toContain("upsert: false");
    expect(finalizeRoute).toContain('"finalize_inspection_pdf_atomic"');
    expect(finalizeRoute).toContain("expectedSyncRevision");
    expect(finalizeRoute).not.toContain('.eq("updated_at", insp.updated_at)');
    expect(finalizeRoute).not.toContain(".upsert(");
    expect(finalizeRoute).not.toContain("onConflict");
  });
});
