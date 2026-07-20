import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260720143000_fix_full_allocation_handoff.sql",
  "utf8",
);

describe("full allocation Parts handoff", () => {
  it("deletes a fully consumed allocation without first storing zero", () => {
    expect(migration).toContain("if v_alloc.qty = p_qty then");
    expect(migration).toContain(
      "delete from public.work_order_part_allocations",
    );
    expect(migration).toContain("set qty = v_alloc.qty - p_qty");
    expect(migration).not.toContain("set qty = qty - p_qty");
    expect(migration).not.toContain("where id = v_alloc.id and qty <= 0");
  });

  it("retains handoff idempotency and canonical quantity updates", () => {
    expect(migration).toContain("idempotency_key = p_idempotency_key");
    expect(migration).toContain("'idempotent', true");
    expect(migration).toContain("quantity_allocated = greatest(");
    expect(migration).toContain(
      "quantity_consumed = coalesce(quantity_consumed, 0) + p_qty",
    );
    expect(migration).toContain(
      "perform public.parts_reconcile_work_order_part",
    );
  });
});
