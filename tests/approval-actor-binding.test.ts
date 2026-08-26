import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read(
  "supabase/migrations/20260825203000_bind_approval_rpc_actors.sql",
);
const runtime = read("tests/security/approval-actor-binding.runtime.sql");

describe("approval RPC actor binding", () => {
  it("checks the authenticated actor before either private approval engine", () => {
    for (const core of [
      "private.apply_portal_line_decision_unbound_core",
      "private.apply_approval_compatibility_bundle_unbound_core",
    ]) {
      const callAt = migration.indexOf(`return ${core}`);
      expect(callAt).toBeGreaterThan(0);
      expect(
        migration.lastIndexOf("public.scheduler_actor_matches", callAt),
      ).toBeGreaterThan(0);
      expect(migration.lastIndexOf("errcode = '42501'", callAt)).toBeGreaterThan(
        0,
      );
    }
  });

  it("keeps unbound engines private and restores only the protected public signatures", () => {
    expect(migration).toContain("set schema private");
    expect(migration).toMatch(
      /revoke all on function private\.apply_portal_line_decision_unbound_core\([\s\S]*?\) from public, anon, authenticated, service_role;/,
    );
    expect(migration).toMatch(
      /revoke all on function private\.apply_approval_compatibility_bundle_unbound_core\([\s\S]*?\) from public, anon, authenticated, service_role;/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.apply_portal_line_decision_atomic\([\s\S]*?\) to authenticated, service_role;/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.apply_approval_compatibility_bundle_atomic\([\s\S]*?\) to authenticated, service_role;/,
    );
  });

  it("covers receipt replay, fresh mutation, trusted replay, and durable state", () => {
    expect(runtime).toContain(
      "Forged portal actor replayed another customer receipt",
    );
    expect(runtime).toContain(
      "Forged compatibility actor replayed another customer receipt",
    );
    expect(runtime).toContain("Forged portal actor created a fresh line decision");
    expect(runtime).toContain(
      "Forged compatibility actor created a fresh decision",
    );
    expect(runtime).toContain("Trusted service portal replay was not preserved");
    expect(runtime).toContain(
      "Trusted service compatibility replay was not preserved",
    );
    expect(runtime).toContain(
      "Authenticated callers retain direct access to an unbound approval core",
    );
    expect(runtime).toContain(
      "Authorized imported staff compatibility approval failed",
    );
    expect(runtime).toContain(
      "Forged imported staff actor replayed another profile receipt",
    );
    expect(runtime).toContain(
      "Linked imported staff approval did not preserve the canonical profile actor",
    );
  });
});
