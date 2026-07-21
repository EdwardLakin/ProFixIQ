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
    expect(autosave).toContain("const serverIsAhead = revision(remote) > revision(local)");
    expect(autosave).toContain(
      "preferCanonicalServer && serverIsAhead && !hasPendingLocalSave",
    );
    expect(autosave).toContain("await pullLatest(true)");
  });

  it("keeps queued offline work protected from canonical bootstrap replacement", () => {
    expect(autosave).toContain(
      "const hasPendingLocalSave = Boolean(pendingOperationKeyRef.current)",
    );
    expect(autosave).toContain("pendingOperationKeyRef.current = recoveredKey");
  });
});
