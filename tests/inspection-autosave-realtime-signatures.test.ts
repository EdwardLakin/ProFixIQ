import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const autosaveHook = readFileSync(
  "features/inspections/hooks/useInspectionAutosave.ts",
  "utf8",
);
const genericScreen = readFileSync(
  "features/inspections/screens/GenericInspectionScreen.tsx",
  "utf8",
);
const reviewPanel = readFileSync(
  "features/inspections/components/inspection/InspectionReviewPanel.tsx",
  "utf8",
);
const signaturePanel = readFileSync(
  "features/inspections/components/inspection/InspectionSignaturePanel.tsx",
  "utf8",
);
const signRoute = readFileSync("app/api/inspections/sign/route.ts", "utf8");
const loadRoute = readFileSync("app/api/inspections/load/route.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260721160000_inspection_live_autosave_signature_hardening.sql",
  "utf8",
);
const desktopSettings = readFileSync(
  "app/dashboard/tech/settings/page.tsx",
  "utf8",
);
const mobileSettings = readFileSync(
  "features/mobile/settings/MobileSettingsScreen.tsx",
  "utf8",
);
const mobileRunner = readFileSync(
  "app/mobile/inspections/[id]/page.tsx",
  "utf8",
);
const signatureIdentityMigration = readFileSync(
  "supabase/migrations/20260721173000_inspection_signature_profile_identity.sql",
  "utf8",
);

describe("inspection autosave, realtime, and signatures", () => {
  it("debounces every session update into the canonical server writer", () => {
    expect(autosaveHook).toContain("saveInspectionSession(");
    expect(autosaveHook).toContain("debounceMs = 700");
    expect(autosaveHook).toContain("maxBarrierPasses");
    expect(genericScreen).toContain("useInspectionAutosave");
    expect(genericScreen).not.toContain("SaveInspectionButton");
    expect(reviewPanel).not.toContain("SaveInspectionButton");
  });

  it("subscribes to cross-device progress and lock changes", () => {
    expect(autosaveHook).toContain('"postgres_changes"');
    expect(autosaveHook).toContain('table: "inspections"');
    expect(autosaveHook).toContain("onRemoteSessionRef.current(remote)");
    expect(loadRoute).toContain("locked: Boolean(inspectionRow?.locked)");
    expect(migration).toContain("'inspection_sessions'");
    expect(migration).toContain("'inspections'");
    expect(migration).toContain("replica identity full");
  });

  it("keeps technician signature identity and image server-owned", () => {
    expect(signRoute).toContain("tech_signature_path");
    expect(signRoute).toContain("tech_signature_hash");
    expect(signRoute).toContain("expectedSyncRevision");
    expect(signaturePanel).not.toContain("fetchSavedTechSignature");
    expect(signaturePanel).not.toContain("signatureImagePath");
    expect(migration).toContain("if p_role = 'technician' then");
    expect(migration).toContain("v_profile.tech_signature_path");
  });

  it("does not require a missing upsert conflict target while signing", () => {
    const signingFunction = migration.slice(
      migration.indexOf("create or replace function public.sign_inspection"),
    );
    expect(signingFunction).toContain("for update");
    expect(signingFunction).toContain("select s.id");
    expect(signingFunction).toContain("insert into public.inspection_signatures");
    expect(signingFunction).not.toContain("on conflict");
  });

  it("uses immutable content-addressed signature paths", () => {
    const expected = "tech-signatures/${profileId}/${hash}.png";
    expect(desktopSettings).toContain(expected);
    expect(mobileSettings).toContain(expected);
    expect(desktopSettings).toContain("upsert: false");
    expect(mobileSettings).toContain("upsert: false");
    expect(migration).toContain("prevent_technician_signature_mutation");
  });

  it("uses the work-order line as the shared mobile and desktop identity", () => {
    expect(genericScreen).toContain("Object.entries(props.params ?? {})");
    expect(genericScreen).toContain("props.embed === true");
    expect(mobileRunner).toContain('.from("work_orders")');
    expect(mobileRunner).toContain("Object.assign(runtimeParams, workOrderContext)");
  });

  it("hydrates canonical media independently of the device autosave", () => {
    expect(loadRoute).toContain('.from("inspection_photos")');
    expect(loadRoute).toContain("mergeCanonicalPhotos");
    expect(loadRoute).toContain("canonicalInspectionId");
  });

  it("resolves linked profile identities for technician signatures", () => {
    expect(signRoute).toContain('.eq("user_id", user.id)');
    expect(signaturePanel).toContain('.eq("user_id", user.id)');
    expect(signatureIdentityMigration).toContain(
      "or p.user_id = v_actor_user_id",
    );
    expect(signatureIdentityMigration).toContain(
      "'tech-signatures/' || v_profile.id::text || '/'",
    );
  });
});

