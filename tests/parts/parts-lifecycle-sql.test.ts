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


describe("parts attach positive quantity SQL", () => {
  const forwardMigration = readFileSync("supabase/migrations/202607130002_fix_parts_attach_positive_quantity.sql", "utf8");
  const manual = readFileSync("db/sql/2026-07-11_parts_lifecycle_consolidated_manual.sql", "utf8");
  const workflowRepair = readFileSync("db/sql/2026-07-11_parts_request_workflow_repair.sql", "utf8");

  const positiveQuantityCase = /case\s+when coalesce\(v_item\.qty_requested, 0\) > 0\s+then v_item\.qty_requested\s+when coalesce\(v_item\.qty, 0\) > 0\s+then v_item\.qty\s+else 0\s+end/;

  function resolveSqlAttachQuantity(qtyRequested: number | null, qty: number | null): number {
    if ((qtyRequested ?? 0) > 0) return qtyRequested ?? 0;
    if ((qty ?? 0) > 0) return qty ?? 0;
    return 0;
  }

  it("resolves the production legacy quantity cases the same way as the SQL case expression", () => {
    expect(resolveSqlAttachQuantity(0, 1)).toBe(1);
    expect(resolveSqlAttachQuantity(0, 6)).toBe(6);
    expect(resolveSqlAttachQuantity(2, 6)).toBe(2);
    expect(resolveSqlAttachQuantity(0, 0)).toBe(0);
    expect(forwardMigration).toMatch(positiveQuantityCase);
  });

  it("uses positive qty_requested before positive legacy qty in every canonical SQL copy", () => {
    for (const source of [sql, manual, workflowRepair, forwardMigration]) {
      expect(source).toMatch(positiveQuantityCase);
      expect(source).not.toContain("v_qty := coalesce(v_item.qty_requested, v_item.qty, 0);");
    }
  });

  it("keeps zero quantities invalid after positive legacy fallback", () => {
    expect(forwardMigration).toContain("if v_qty <= 0 then raise exception 'Quantity must be greater than 0.'; end if;");
  });

  it("keeps parts_attach_request_item idempotent and the ensure wrapper delegated", () => {
    expect(forwardMigration).toContain("source_parts_request_item_id = p_request_item_id and coalesce(is_active,true) for update");
    expect(forwardMigration).toContain("select public.parts_attach_request_item(p_request_item_id);");
  });

  it("does not allocate stock, create purchase orders, insert stock movements, or learn menu items", () => {
    expect(forwardMigration).not.toContain("upsert_part_allocation_from_request_item");
    expect(forwardMigration).not.toContain("parts_allocate_request_item");
    expect(forwardMigration).not.toContain("insert into public.stock_moves");
    expect(forwardMigration).not.toContain("purchase_order");
    expect(forwardMigration).not.toMatch(/menu[_ ]?learning|menu_repair|menu_items/i);
  });

  it("is forward-only and leaves existing work_order_parts rows untouched", () => {
    expect(forwardMigration).toContain("Forward-only migration");
    expect(forwardMigration).not.toMatch(/\b(update|delete|truncate)\s+public\.work_order_parts\b/i);
  });

  it("restores execute permissions for app and service callers", () => {
    expect(forwardMigration).toContain("grant execute on function public.parts_attach_request_item(uuid) to authenticated, service_role;");
    expect(forwardMigration).toContain("grant execute on function public.parts_ensure_work_order_part(uuid) to authenticated, service_role;");
  });
});
