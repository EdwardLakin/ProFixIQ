import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8").replaceAll("\r", "");

const fix = read(
  "supabase/migrations/20261004160000_fix_portal_custom_and_diagnostic_lines.sql",
);
const requestLineMigration = read(
  "supabase/migrations/20260715080200_phase7_atomic_portal_request_lines.sql",
);
const diagnosticMigration = read(
  "supabase/migrations/20260723010000_portal_service_quote_requests.sql",
);

function definition(source: string, name: string): string {
  const start = source.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} must be defined`).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("\n$$;", start);
  return source.slice(start, end + 4);
}

const normalize = (value: string) => value.replace(/\s+/g, " ").trim();

describe("portal custom and diagnostic line fix", () => {
  it("contains no DROP statements so the connector can apply it", () => {
    expect(fix).not.toMatch(/^\s*drop\s/im);
  });

  it("stops writing the generated punchable column and uses the canonical diagnosis job type", () => {
    const request = definition(fix, "add_portal_request_line_atomic");
    const diagnostic = definition(fix, "add_portal_diagnostic_line_atomic");
    expect(request).not.toContain("punchable");
    expect(diagnostic).toContain("set job_type = 'diagnosis'");
    expect(diagnostic).toContain("'{line,job_type}', '\"diagnosis\"'::jsonb");
    expect(diagnostic).not.toContain("job_type = 'diagnostic'");
    // The response label is part of the existing contract and is unchanged.
    expect(diagnostic).toContain("'{kind}', '\"diagnostic\"'::jsonb");
  });

  it("changes nothing else in add_portal_request_line_atomic", () => {
    const before = definition(requestLineMigration, "add_portal_request_line_atomic");
    const after = definition(fix, "add_portal_request_line_atomic");
    const restored = after
      .replace(
        "approval_state, line_type, labor_time, price_estimate,",
        "approval_state, line_type, punchable, labor_time, price_estimate,",
      )
      .replace(
        "'awaiting_approval', 'pending', v_line_type,\n      null, null, 'portal_request:' || p_operation_key, v_now",
        "'awaiting_approval', 'pending', v_line_type,\n      case when v_line_type = 'info' then false else null end,\n      null, null, 'portal_request:' || p_operation_key, v_now",
      );
    expect(normalize(restored)).toBe(normalize(before));
  });

  it("changes nothing else in add_portal_diagnostic_line_atomic", () => {
    const before = definition(diagnosticMigration, "add_portal_diagnostic_line_atomic");
    const after = definition(fix, "add_portal_diagnostic_line_atomic");
    const restored = after
      .replace("set job_type = 'diagnosis'", "set job_type = 'diagnostic'")
      .replace("'{line,job_type}', '\"diagnosis\"'::jsonb", "'{line,job_type}', '\"diagnostic\"'::jsonb");
    expect(normalize(restored)).toBe(normalize(before));
  });

  it("keeps both functions security definer with a pinned search_path and leaves grants alone", () => {
    for (const name of ["add_portal_request_line_atomic", "add_portal_diagnostic_line_atomic"]) {
      const body = definition(fix, name);
      expect(body).toContain("security definer");
      expect(body).toContain("set search_path = public");
    }
    // CREATE OR REPLACE preserves privileges; no grant or revoke is touched here.
    expect(fix).not.toMatch(/\b(grant|revoke)\b/i);
  });

  it("is exercised by a runtime test in the clean replay workflow", () => {
    const workflow = read(".github/workflows/supabase-clean-replay-audit.yml");
    expect(workflow).toContain("tests/security/portal-diagnosis-line.runtime.sql");
    const runtime = read("tests/security/portal-diagnosis-line.runtime.sql");
    for (const preserved of [
      "'diagnosis'",
      "Work order is not owned by this portal customer.",
      "Portal customer actor mismatch.",
      "Custom request description is required.",
      "'menu'",
    ]) {
      expect(runtime).toContain(preserved);
    }
  });
});
