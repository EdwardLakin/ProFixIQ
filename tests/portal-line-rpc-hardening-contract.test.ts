import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8").replaceAll("\r", "");

const hardening = read("supabase/migrations/20261004183440_harden_portal_line_rpcs.sql");
const previous = read(
  "supabase/migrations/20261004160229_fix_portal_custom_and_diagnostic_lines.sql",
);
const decisionBinding = read("supabase/migrations/20260825203000_bind_approval_rpc_actors.sql");

function definition(source: string, name: string): string {
  const replace = source.indexOf(`create or replace function public.${name}(`);
  const start = replace >= 0 ? replace : source.indexOf(`create function public.${name}(`);
  expect(start, `${name} must be defined`).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("\n$$;", start);
  return source.slice(start, end + 4);
}

const normalize = (value: string) => value.replace(/\s+/g, " ").trim();

describe("portal line RPC hardening migration", () => {
  it("has no DROP statements and no grant changes", () => {
    expect(hardening).not.toMatch(/^\s*drop\s/im);
    expect(hardening).not.toMatch(/\b(grant|revoke)\b/i);
  });

  it("binds authenticated callers to the supplied actor and keeps service-role calls", () => {
    const request = definition(hardening, "add_portal_request_line_atomic");
    expect(request).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(request).toContain("auth.uid() is distinct from p_actor_user_id");
    // The binding runs before the receipt lookup and every mutation.
    expect(request.indexOf("auth.uid() is distinct from p_actor_user_id")).toBeLessThan(
      request.indexOf("from public.portal_lifecycle_operation_keys"),
    );
  });

  it("claims the operation key before the receipt lookup", () => {
    const request = definition(hardening, "add_portal_request_line_atomic");
    expect(request).toContain("pg_advisory_xact_lock(");
    expect(request.indexOf("pg_advisory_xact_lock(")).toBeLessThan(
      request.indexOf("from public.portal_lifecycle_operation_keys"),
    );
  });

  it("changes nothing else in add_portal_request_line_atomic", () => {
    const before = definition(previous, "add_portal_request_line_atomic");
    const after = definition(hardening, "add_portal_request_line_atomic");
    const start = after.indexOf("  -- Authenticated callers must be the supplied actor;");
    const end = after.indexOf("  select result into v_existing");
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    expect(normalize(after.slice(0, start) + after.slice(end))).toBe(normalize(before));
  });

  it("returns the stored result on a diagnostic replay and persists the final result", () => {
    const diagnostic = definition(hardening, "add_portal_diagnostic_line_atomic");
    expect(diagnostic).toContain("if coalesce((v_result ->> 'idempotent')::boolean, false) then");
    expect(diagnostic.indexOf("return v_result;")).toBeLessThan(
      diagnostic.indexOf("update public.work_order_lines"),
    );
    expect(diagnostic).toContain("update public.portal_lifecycle_operation_keys");
    expect(diagnostic).toContain("operation_name = 'portal_request_line_custom'");
    expect(diagnostic).toContain("job_type = 'diagnosis'");
  });

  it("changes nothing else in add_portal_diagnostic_line_atomic", () => {
    const before = definition(previous, "add_portal_diagnostic_line_atomic");
    const after = definition(hardening, "add_portal_diagnostic_line_atomic");
    const restored = after
      .replace("  v_final jsonb;\n", "")
      .replace(
        "  -- A replay returns the receipt stored by the first successful call.\n  if coalesce((v_result ->> 'idempotent')::boolean, false) then\n    return v_result;\n  end if;\n\n",
        "",
      )
      .replace(
        /  v_final := jsonb_set\(\n([\s\S]*?)\n  \);\n\n  -- Persist[\s\S]*?  return v_final;/,
        "  return jsonb_set(\n$1\n  );",
      );
    expect(normalize(restored)).toBe(normalize(before));
  });

  it("refuses to approve informational lines in the decision wrapper without changing its guard", () => {
    const decision = definition(hardening, "apply_portal_line_decision_atomic");
    const live = definition(decisionBinding, "apply_portal_line_decision_atomic");
    expect(decision).toContain("l.line_type = 'info'");
    expect(decision).toContain("Informational lines cannot be approved.");
    // The existing actor guard and delegation are untouched.
    for (const preserved of [
      "if coalesce(auth.role(), '') <> 'service_role'",
      "and not public.scheduler_actor_matches(p_actor_user_id) then",
      "message = 'Authenticated approval actor mismatch.'",
      "return private.apply_portal_line_decision_unbound_core(",
    ]) {
      expect(decision).toContain(preserved);
    }
    expect(live).toContain("return private.apply_portal_line_decision_unbound_core(");
  });

  it("keeps every function security definer with a pinned search_path", () => {
    for (const name of [
      "add_portal_request_line_atomic",
      "add_portal_diagnostic_line_atomic",
      "apply_portal_line_decision_atomic",
    ]) {
      const body = definition(hardening, name);
      expect(body).toContain("security definer");
      expect(body).toMatch(/set search_path (=|to) (public|'')/);
    }
  });

  it("is exercised by a runtime test in the clean replay workflow", () => {
    expect(read(".github/workflows/supabase-clean-replay-audit.yml")).toContain(
      "tests/security/portal-line-rpc-hardening.runtime.sql",
    );
    const runtime = read("tests/security/portal-line-rpc-hardening.runtime.sql");
    for (const covered of [
      "Portal customer actor mismatch.",
      "Informational lines cannot be approved.",
      "service_role_call",
      "diagnostic_replay",
    ]) {
      expect(runtime).toContain(covered);
    }
  });
});
