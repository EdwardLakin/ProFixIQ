import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const autosaveHook = readFileSync(
  "features/inspections/hooks/useInspectionRealtimeAutosave.tsx",
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
  "supabase/migrations/20260721143000_inspection_autosave_realtime_signatures.sql",
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

describe("inspection autosave, realtime, and signatures", () => {
  it("debounces every session update into the canonical server writer", () => {
    expect(autosaveHook).toContain("saveInspectionSession(session, workOrderLineId)");
    expect(autosaveHook).toContain("debounceMs = 800");
    expect(genericScreen).toContain("useInspectionRealtimeAutosave");
    expect(genericScreen).not.toContain("SaveInspectionButton");
    expect(reviewPanel).not.toContain("SaveInspectionButton");
  });

  it("subscribes to cross-device progress and lock changes", () => {
    expect(autosaveHook).toContain('table: "inspection_sessions"');
    expect(autosaveHook).toContain('table: "inspections"');
    expect(autosaveHook).toContain("onRemoteSessionRef.current(value)");
    expect(loadRoute).toContain("Boolean(inspectionRow?.locked)");
    expect(migration).toContain(
      "alter publication supabase_realtime add table public.inspection_sessions",
    );
    expect(migration).toContain(
      "alter publication supabase_realtime add table public.inspections",
    );
  });

  it("keeps technician signature identity and image server-owned", () => {
    expect(signRoute).toContain(
      "tech_signature_path, tech_signature_hash",
    );
    expect(signRoute).toContain(
      'role === "technician" ? profile?.tech_signature_path',
    );
    expect(signaturePanel).not.toContain("fetchSavedTechSignature");
    expect(signaturePanel).not.toContain("signatureImagePath,");
    expect(migration).toContain("if p_role = 'technician' then");
    expect(migration).toContain("p.tech_signature_path");
  });

  it("does not require a missing upsert conflict target while signing", () => {
    const signingFunction = migration.slice(
      migration.indexOf("create or replace function public.sign_inspection"),
    );
    expect(signingFunction).toContain("pg_advisory_xact_lock");
    expect(signingFunction).toContain("select s.id");
    expect(signingFunction).not.toContain("on conflict");
  });

  it("uses content-addressed signature paths for historical integrity", () => {
    const expected = "tech-signatures/${profileId}/${hash}.png";
    expect(desktopSettings).toContain(expected);
    expect(mobileSettings).toContain(expected);
  });
});
