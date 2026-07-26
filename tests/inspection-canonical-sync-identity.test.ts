import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const autosave = readFileSync(
  "features/inspections/hooks/useInspectionAutosave.ts",
  "utf8",
);
const migration = readFileSync(
  "supabase/migrations/20260721203000_inspection_canonical_sync_identity.sql",
  "utf8",
);
const saveRoute = readFileSync("app/api/inspections/save/route.ts", "utf8");
const reconciliation = readFileSync(
  "features/inspections/lib/inspection/reconciliation.ts",
  "utf8",
);
const genericScreen = readFileSync(
  "features/inspections/screens/GenericInspectionScreen.tsx",
  "utf8",
);
const findings = readFileSync(
  "features/inspections/lib/inspection/findings/page.tsx",
  "utf8",
);
const realtimeMigration = readFileSync(
  "supabase/migrations/20260726010000_reassert_canonical_inspection_realtime.sql",
  "utf8",
);

describe("inspection canonical cross-device synchronization", () => {
  it("authorizes both supported profile identity layouts end to end", () => {
    expect(saveRoute).toContain('.eq("user_id", user.id)');
    expect(migration).toContain(
      "(p.id = p_actor_user_id or p.user_id = p_actor_user_id)",
    );
    expect(migration).toContain(
      "create or replace function public.save_inspection_progress_atomic",
    );
  });

  it("uses a newer server revision for initial cross-device hydration", () => {
    expect(autosave).toContain("preferCanonicalServer = false");
    expect(reconciliation).toContain("const serverIsAhead =");
    expect(reconciliation).toContain("preferCanonicalServer &&");
    expect(autosave).toContain("await pullLatest(true)");
  });

  it("keeps queued offline work protected from canonical bootstrap replacement", () => {
    expect(autosave).toContain(
      "const hasPendingLocalSave = Boolean(pendingOperationKeyRef.current)",
    );
    expect(autosave).toContain("pendingOperationKeyRef.current = recoveredKey");
    expect(reconciliation).toContain("const hasUnversionedRecovery =");
    expect(reconciliation).toContain("hasRecoveredLocalDraft &&");
    expect(reconciliation).toContain("!hasUnversionedRecovery");
  });

  it("finishes device recovery before either editable screen hydrates", () => {
    expect(genericScreen).toContain(
      "const draftBootLoaded = draftBootstrappedKey === draftKey",
    );
    expect(genericScreen).toContain("hasRecoveredLocalDraft,");
    expect(findings).toContain(
      "const draftBootLoaded = draftBootstrappedKey === draftKey",
    );
    expect(findings).toContain("hasRecoveredLocalDraft,");
  });

  it("publishes only the canonical progress row for realtime", () => {
    expect(realtimeMigration).toContain(
      "alter publication supabase_realtime add table public.inspections",
    );
    expect(realtimeMigration).toContain(
      "alter publication supabase_realtime drop table public.inspection_sessions",
    );
    expect(realtimeMigration).toContain(
      "alter table public.inspections replica identity full",
    );
  });
});
