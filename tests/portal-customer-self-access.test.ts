import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const migration = read(
  "supabase/migrations/20260830010000_restore_portal_customer_self_access.sql",
);
const runtimeProof = read(
  "tests/security/portal-customer-self-access.runtime.sql",
);
const cleanReplayWorkflow = read(
  ".github/workflows/supabase-clean-replay-audit.yml",
);
const portalAuth = read("features/portal/server/portalAuth.ts");

describe("portal customer self access", () => {
  it("lets a portal customer read their own customer record", () => {
    // Every pre-existing customers SELECT policy requires a staff identity, and
    // a pure portal customer has no profiles row at all.
    expect(migration).toContain("create policy customers_portal_self_select");
    expect(migration).toContain("using (user_id = auth.uid())");
  });

  it("lets a portal customer read only their own accepted invite evidence", () => {
    expect(migration).toContain(
      "create policy customer_portal_invites_self_accepted_select",
    );
    expect(migration).toContain("accepted_by_user_id = auth.uid()");
    // Revocation must be enforced by the policy itself, so it cannot be lost by
    // an application filter changing.
    expect(migration).toContain("and accepted_at is not null");
    expect(migration).toContain("and revoked_at is null");
  });

  it("matches the reads the canonical portal guard actually performs", () => {
    expect(portalAuth).toContain('.eq("accepted_by_user_id", userId)');
    expect(portalAuth).toContain('.not("accepted_at", "is", null)');
    expect(portalAuth).toContain('.is("revoked_at", null)');
  });

  it("withholds the invite token from authenticated callers", () => {
    expect(migration).toContain(
      "revoke select on public.customer_portal_invites from authenticated",
    );
    expect(migration).toContain("grant select (");
    expect(migration).not.toMatch(/grant select \([^)]*\btoken\b/s);
  });

  it("removes the anonymous grant the schema baseline left on invites", () => {
    expect(migration).toContain(
      "revoke all on public.customer_portal_invites from anon",
    );
  });

  it("proves the boundary against a replayed database in CI", () => {
    expect(runtimeProof).toContain("portal_customer_self_access_ok");
    expect(runtimeProof).toContain(
      "Portal customer can read another customer invite",
    );
    expect(runtimeProof).toContain(
      "A revoked portal customer still reads invite evidence",
    );
    expect(runtimeProof).toContain("Staff lost shop-scoped customer visibility");
    expect(runtimeProof).toContain(
      "Authenticated callers can read the portal invite token",
    );
    expect(cleanReplayWorkflow).toContain(
      "tests/security/portal-customer-self-access.runtime.sql",
    );
    expect(cleanReplayWorkflow).toContain(
      "portal-customer-self-access-runtime.log",
    );
  });
});
