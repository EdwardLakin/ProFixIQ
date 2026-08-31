import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260831122000_reconcile_legacy_canonical_line_assignments.sql",
  "utf8",
);

describe("legacy/canonical technician assignment reconciliation", () => {
  it("retires both legacy mirror triggers before reconciling rows", () => {
    const firstDrop = migration.indexOf(
      "drop trigger if exists trg_sync_work_order_line_assignee",
    );
    const secondDrop = migration.indexOf(
      "drop trigger if exists trg_wol_sync_assigned_to",
    );
    const reconciliation = migration.indexOf("update public.work_order_lines line");

    expect(firstDrop).toBeGreaterThanOrEqual(0);
    expect(secondDrop).toBeGreaterThanOrEqual(0);
    expect(reconciliation).toBeGreaterThan(secondDrop);
    expect(reconciliation).toBeGreaterThan(firstDrop);
  });

  it("clears legacy assignment only when it exactly matches the canonical primary", () => {
    expect(migration).toContain("line.assigned_to = line.assigned_tech_id");
    expect(migration).toContain("assignment.technician_id = line.assigned_tech_id");
    expect(migration).toContain("set assigned_to = null");
    expect(migration).not.toMatch(/set\s+assigned_tech_id\s*=/i);
  });

  it("does not drop canonical assignment enforcement", () => {
    expect(migration).not.toContain(
      "drop trigger if exists enforce_work_order_line_assignment_contract",
    );
    expect(migration).not.toContain(
      "drop trigger if exists enforce_work_order_line_technician_assignment_contract",
    );
  });
});
