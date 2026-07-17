import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260717021000_fix_punch_correction_audit_schema.sql",
  "utf8",
);

describe("workforce punch correction audit schema", () => {
  it("writes only canonical audit_logs columns", () => {
    expect(migration).toContain(
      "insert into public.audit_logs (\n    actor_id, action, target, metadata",
    );
    expect(migration).not.toContain(
      "shop_id, actor_id, action, target_table, target_id, metadata",
    );
  });

  it("keeps tenant and target context in audit metadata", () => {
    expect(migration).toContain("'shop_id', p_shop_id");
    expect(migration).toContain("'target_table', 'punch_events'");
    expect(migration).toContain("'target_id', v_punch.id");
    expect(migration).toContain("v_punch.id::text");
  });

  it("preserves punch authorization, payroll locks, and correction evidence", () => {
    expect(migration).toContain("coalesce(v_actor.role, '') not in ('owner', 'admin', 'manager')");
    expect(migration).toContain("Approved/exported payroll periods are locked");
    expect(migration).toContain("insert into public.punch_corrections");
    expect(migration).toContain("update public.punch_events");
  });
});
