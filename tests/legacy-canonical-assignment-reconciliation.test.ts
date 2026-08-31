import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260831122000_reconcile_legacy_canonical_line_assignments.sql",
  "utf8",
);

describe("legacy/canonical technician assignment reconciliation", () => {
  it("clears legacy assignment only when it exactly matches the canonical primary", () => {
    expect(migration).toContain("line.assigned_to = line.assigned_tech_id");
    expect(migration).toContain("assignment.technician_id = line.assigned_tech_id");
    expect(migration).toContain("set assigned_to = null");
    expect(migration).not.toMatch(/set\s+assigned_tech_id\s*=/i);
  });
});
