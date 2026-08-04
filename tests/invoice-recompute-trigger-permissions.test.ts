import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260804051000_restore_authenticated_invoice_recompute.sql";

function migrationSource() {
  return readFileSync(migrationPath, "utf8");
}

describe("invoice recompute trigger permissions", () => {
  it("restores the authenticated trigger path without public or anonymous access", () => {
    const migration = migrationSource();

    expect(migration).toContain(
      "grant execute on function public.recompute_live_invoice_costs(uuid)\n  to authenticated, service_role",
    );
    expect(migration).toContain(
      "revoke all on function public.recompute_live_invoice_costs(uuid)\n  from public, anon",
    );
  });

  it("guards the definer function with actor and tenant membership checks", () => {
    const migration = migrationSource();

    expect(migration).toContain("v_actor_user_id uuid := auth.uid()");
    expect(migration).toContain("from public.user_shops us");
    expect(migration).toContain("us.user_id = v_actor_user_id");
    expect(migration).toContain("us.shop_id = v_shop_id");
    expect(migration).toContain("using errcode = '42501'");
  });

  it("keeps the privileged service path explicit and the search path pinned", () => {
    const migration = migrationSource();

    expect(migration).toContain("security definer\nset search_path = ''");
    expect(migration).toContain("v_jwt_role <> 'service_role'");
    expect(migration).toContain(
      "session_user not in ('postgres', 'supabase_admin')",
    );
  });
});

