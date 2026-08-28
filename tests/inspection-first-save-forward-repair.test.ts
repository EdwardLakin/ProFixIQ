import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260827215821_repair_inspection_first_save_revision.sql",
  "utf8",
);
const runtime = readFileSync(
  "tests/security/inspection-first-save.runtime.sql",
  "utf8",
);
const cleanReplay = readFileSync(
  ".github/workflows/supabase-clean-replay-audit.yml",
  "utf8",
);

describe("inspection first-save forward repair", () => {
  it("carries the inserted revision into the existing compare-and-swap", () => {
    expect(migration).toContain(
      "returning id, summary, updated_at, sync_revision",
    );
    expect(migration).toContain(
      "v_server_updated_at,\n        v_server_revision;",
    );
    expect(migration).toContain("v_next_revision := v_server_revision + 1");
    expect(migration).toContain("and sync_revision = v_server_revision");
  });

  it("preserves the writer security and lifecycle boundaries", () => {
    expect(migration).toContain("auth.uid() <> p_actor_user_id");
    expect(migration).toContain("and wol.shop_id = p_shop_id");
    expect(migration).toContain("Actor is not a member of this shop.");
    expect(migration).toContain("Inspection is finalized and locked");
    expect(migration).toContain("Inspection operation key was reused");
    expect(migration).toContain("security definer\nset search_path = public");
    expect(migration).toContain("to authenticated, service_role");
  });

  it("runs the behavior regression during clean replay", () => {
    expect(runtime).toContain("no canonical inspection exists before");
    expect(runtime).toContain("Initial inspection retry was not idempotent");
    expect(runtime).toContain("Stale inspection snapshot did not preserve");
    expect(runtime).toContain("Cross-Shop inspection save was not rejected");
    expect(runtime).toContain("Finalized inspection accepted another save");
    expect(cleanReplay).toContain(
      "-f tests/security/inspection-first-save.runtime.sql",
    );
  });
});
