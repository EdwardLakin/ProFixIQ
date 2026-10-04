import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8").replaceAll("\r", "");

const refusal = read("supabase/migrations/20261004190000_refuse_portal_info_lines.sql");
const hardening = read("supabase/migrations/20261004183440_harden_portal_line_rpcs.sql");

function definition(source: string, name: string): string {
  const start = source.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} must be defined`).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("\n$$;", start);
  return source.slice(start, end + 4);
}

const normalize = (value: string) => value.replace(/\s+/g, " ").trim();

describe("portal informational line refusal migration", () => {
  it("has no DROP statements and no grant changes", () => {
    expect(refusal).not.toMatch(/^\s*drop\s/im);
    expect(refusal).not.toMatch(/\b(grant|revoke)\b/i);
  });

  it("refuses to create informational lines instead of coercing them to jobs", () => {
    const request = definition(refusal, "add_portal_request_line_atomic");
    expect(request).toContain("Informational lines cannot be requested from the portal.");
    expect(request).toContain("v_line_type := 'job';");
    expect(request).not.toContain("then 'info' else 'job'");
  });

  it("changes nothing else in add_portal_request_line_atomic", () => {
    const before = definition(hardening, "add_portal_request_line_atomic");
    const after = definition(refusal, "add_portal_request_line_atomic");
    const start = after.indexOf("    -- Informational lines are not requested from the portal:");
    const end = after.indexOf("    v_line_type := 'job';\n") + "    v_line_type := 'job';\n".length;
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const restored =
      after.slice(0, start) +
      "    v_line_type := case when lower(trim(coalesce(p_line_type, ''))) = 'info' then 'info' else 'job' end;\n" +
      after.slice(end);
    expect(normalize(restored)).toBe(normalize(before));
  });

  it("scopes the approval refusal to the caller's own customer and work order", () => {
    const decision = definition(refusal, "apply_portal_line_decision_atomic");
    for (const scoped of [
      "wo.customer_id = p_customer_id",
      "c.user_id = p_actor_user_id",
      "l.shop_id = p_shop_id",
      "l.work_order_id = p_work_order_id",
      "l.line_type = 'info'",
    ]) {
      expect(decision).toContain(scoped);
    }
    // The refusal still precedes delegation, and the existing guard is intact.
    expect(decision.indexOf("Informational lines cannot be approved.")).toBeLessThan(
      decision.indexOf("return private.apply_portal_line_decision_unbound_core("),
    );
    expect(decision).toContain("and not public.scheduler_actor_matches(p_actor_user_id) then");
  });

  it("keeps the rest of the decision wrapper unchanged", () => {
    const before = definition(hardening, "apply_portal_line_decision_atomic");
    const after = definition(refusal, "apply_portal_line_decision_atomic");
    const restored = after
      .replace(
        /       join public\.work_orders wo\n         on wo\.id = l\.work_order_id\n        and wo\.shop_id = l\.shop_id\n       join public\.customers c\n         on c\.id = wo\.customer_id\n/,
        "",
      )
      .replace("         and wo.customer_id = p_customer_id\n         and c.user_id = p_actor_user_id\n", "")
      .replace(
        "  -- generated punchable column true, so approval is refused. The check is\n  -- scoped to the caller's own customer and work order, so a call that does\n  -- not own the line falls through to the core's generic errors and cannot\n  -- learn whether another tenant's line exists.",
        "  -- generated punchable column true, so approval is refused.",
      );
    expect(normalize(restored)).toBe(normalize(before));
  });

  it("keeps both functions security definer with a pinned search_path", () => {
    expect(definition(refusal, "add_portal_request_line_atomic")).toContain("set search_path = public");
    expect(definition(refusal, "apply_portal_line_decision_atomic")).toContain("set search_path to ''");
    for (const name of ["add_portal_request_line_atomic", "apply_portal_line_decision_atomic"]) {
      expect(definition(refusal, name)).toContain("security definer");
    }
  });

  it("is covered by the clean-replay runtime proofs", () => {
    const runtime = read("tests/security/portal-line-rpc-hardening.runtime.sql");
    for (const covered of [
      "Informational lines cannot be requested from the portal.",
      "probe_info",
      "request_info",
    ]) {
      expect(runtime).toContain(covered);
    }
    expect(read("tests/security/portal-diagnosis-line.runtime.sql")).toContain(
      "Informational lines cannot be requested from the portal.",
    );
  });
});
