import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync("db/sql/2026-07-11_parts_request_workflow_repair.sql", "utf8");

describe("parts request workflow repair migration", () => {
  it("adds durable source links and idempotency constraints", () => {
    expect(migration).toContain("source_parts_request_item_id");
    expect(migration).toContain("source_parts_request_id");
    expect(migration).toContain("work_order_line_id");
    expect(migration).toContain("uq_work_order_parts_active_source_request_item");
    expect(migration).toContain("uq_wopa_work_order_part_location");
    expect(migration).toContain("work_order_part_id");
  });

  it("uses the existing canonical work-order parts, allocations, and stock movement tables", () => {
    expect(migration).toContain("public.work_order_parts");
    expect(migration).toContain("public.work_order_part_allocations");
    expect(migration).toContain("public.stock_moves");
    expect(migration).toContain("create or replace function public.upsert_part_allocation_from_request_item");
  });

  it("keeps allocation idempotent and does not treat stock absence as mismatch", () => {
    expect(migration).toContain("on conflict (source_parts_request_item_id)");
    expect(migration).toContain("on conflict (work_order_part_id, location_id)");
    expect(migration).not.toContain("on conflict (reference_kind, reference_id, reason)");
    expect(migration).toContain("'wo_allocate'");
    expect(migration).not.toMatch(/no stock.*mismatch/i);
  });
});
