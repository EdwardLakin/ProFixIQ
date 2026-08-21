import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(join(process.cwd(), path), "utf8");

const migration = source(
  "supabase/migrations/20260821151500_harden_workforce_inspection_rpc_acl.sql",
);

const protectedFunctions = [
  "correct_work_order_line_labor_segment",
  "replace_work_order_line_flat_rate_credits",
  "submit_staff_time_off_request",
  "save_inspection_progress_atomic",
  "save_inspection_progress_v2_atomic",
  "save_inspection_progress_v3_atomic",
];

describe("workforce and inspection mutating RPC ACL hardening", () => {
  it("removes anonymous execution from all six approved signatures", () => {
    for (const functionName of protectedFunctions) {
      expect(migration).toContain(`function public.${functionName}`);
      expect(migration).toContain(`'public.${functionName}(`);
    }

    expect(migration.match(/from public, anon;/g)).toHaveLength(6);
    expect(migration).toContain(
      "has_function_privilege('anon', signature, 'EXECUTE')",
    );
  });

  it("preserves authenticated and service-role execution for every signature", () => {
    expect(migration.match(/to authenticated, service_role;/g)).toHaveLength(6);
    expect(migration).toContain(
      "not has_function_privilege('authenticated', signature, 'EXECUTE')",
    );
    expect(migration).toContain(
      "not has_function_privilege('service_role', signature, 'EXECUTE')",
    );
  });

  it("is a forward-only ACL migration with replay-time assertions", () => {
    expect(migration).toMatch(/^begin;/);
    expect(migration).toContain("to_regprocedure(signature) is null");
    expect(migration).toMatch(/commit;\s*$/);
    expect(migration).not.toMatch(
      /\b(?:drop|alter|create)\s+(?:table|column|type|function)\b/i,
    );
  });
});
