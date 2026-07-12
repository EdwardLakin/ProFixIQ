import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("db/sql/2026-07-11_parts_lifecycle_completion.sql", "utf8");
const audit = readFileSync("db/sql/2026-07-11_parts_lifecycle_readonly_audit.sql", "utf8");

describe("parts lifecycle completion SQL", () => {
  it("uses operation idempotency instead of broad source/reason uniqueness", () => {
    expect(sql).toContain("add column if not exists idempotency_key text");
    expect(sql).toContain("uq_stock_moves_shop_idempotency_key");
    expect(sql).toContain("drop index if exists public.uq_stock_moves_reference_reason");
    expect(sql).toContain("add column if not exists lifecycle_quantity numeric");
  });

  it("keeps allocation/release out of physical on-hand", () => {
    expect(sql).toContain("sm.reason not in ('wo_allocate','wo_release')");
    expect(sql).toContain("values (v_wop.part_id, p_location_id, 0, 'wo_allocate'");
    expect(sql).toContain("values (v_wop.part_id, p_location_id, 0, 'wo_release'");
  });

  it("adds canonical commands for the remaining lifecycle", () => {
    for (const fn of [
      "parts_allocate_request_item",
      "parts_release_allocation",
      "parts_create_po_line_for_request",
      "parts_receive_request_item",
      "parts_issue_work_order_part",
      "parts_return_to_stock",
      "parts_cancel_request_item",
      "parts_replace_request_item",
    ]) expect(sql).toContain(`function public.${fn}`);
  });

  it("blocks over-allocation, over-receipt, over-issue, and over-return", () => {
    expect(sql).toContain("Insufficient available stock");
    expect(sql).toContain("Receipt exceeds ordered quantity");
    expect(sql).toContain("Cannot issue more than allocated quantity");
    expect(sql).toContain("Cannot return more than issued and unreturned quantity");
  });
});

describe("parts lifecycle read-only audit", () => {
  it("reports lifecycle integrity findings without writes", () => {
    expect(audit).toContain("request_items_without_work_order_line");
    expect(audit).toContain("duplicate_work_order_parts_per_source_request_item");
    expect(audit).toContain("allocated_greater_than_on_hand");
    expect(audit).toContain("duplicate_movement_idempotency_keys");
    expect(audit).toContain("allocations_work_order_part_scope_mismatch");
    expect(audit).toContain("zero_quantity_reservation_audit_missing_lifecycle_quantity");
    expect(audit).toContain("work_order_part_snapshot_inconsistent_with_part");
    expect(audit).toContain("replacement_link_cycles");
    expect(audit).not.toMatch(/\b(insert|update|delete|alter|drop|create)\b/i);
  });
});
