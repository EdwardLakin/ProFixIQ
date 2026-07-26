import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260726195133_inspection_last_edit_wins.sql",
  "utf8",
);
const saveClient = readFileSync(
  "features/inspections/lib/inspection/save.ts",
  "utf8",
);
const autosave = readFileSync(
  "features/inspections/hooks/useInspectionAutosave.ts",
  "utf8",
);

describe("inspection last-edit-wins synchronization", () => {
  it("serializes every device through the canonical line inspection", () => {
    expect(migration).toContain(
      "create or replace function public.save_inspection_progress_v3_atomic",
    );
    expect(migration).toContain("and i.is_canonical");
    expect(migration).toContain("for update;");
    expect(migration).toContain("v_next_revision := v_server_revision + 1");
    expect(migration).toContain("and sync_revision = v_server_revision");
  });

  it("accepts a stale-base edit only when its edit timestamp is newer", () => {
    expect(migration).toContain("v_client_revision < v_server_revision");
    expect(migration).toContain(
      "v_client_last_updated <= v_server_last_updated",
    );
    expect(migration).not.toContain(
      "if v_client_revision <> v_server_revision then",
    );
  });

  it("does not treat a freshly opened blank template as a newer edit", () => {
    expect(migration).toContain("v_client_has_progress boolean := false");
    expect(migration).toContain("v_server_has_progress boolean := false");
    expect(migration).toContain(
      "(not v_client_has_progress and v_server_has_progress)",
    );
    expect(migration).toContain(
      "v_client_has_progress = v_server_has_progress",
    );
  });

  it("acknowledges an older recovered payload without replacing shop truth", () => {
    expect(migration).toContain("'session', v_canonical_session");
    expect(migration).toContain("'superseded', true");
    expect(migration).toContain("'session_fingerprint', v_session_fingerprint");
    expect(saveClient).toContain(
      "serverSession: serverResponse.current?.session",
    );
    expect(autosave).toContain("result.superseded");
    expect(autosave).toContain("applyRemote(");
    expect(autosave).toContain("canonicalSnapshot");
  });

  it("preserves an edit made while a superseded save is in flight", () => {
    expect(autosave).toContain(
      "inspectionFingerprint(current) !== nextFingerprint",
    );
    expect(autosave).toContain("edited again while that request was in flight");
    expect(autosave).toContain("syncRevision: canonicalSnapshot.syncRevision");
    expect(autosave).toContain("inspectionFingerprint(canonicalSnapshot)");
  });

  it("does not weaken finalization, tenant, or idempotency guards", () => {
    expect(migration).toContain("p.shop_id = p_shop_id");
    expect(migration).toContain("wol.shop_id = p_shop_id");
    expect(migration).toContain("Inspection is finalized and locked");
    expect(migration).toContain("not coalesce(locked, false)");
    expect(migration).toContain("not coalesce(completed, false)");
    expect(migration).toContain("Inspection operation key was reused");
    expect(migration).toContain("to authenticated, service_role");
  });
});
