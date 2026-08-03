import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("phase 3 parts SQL contract", () => {
  const atomic = source(
    "supabase/migrations/20260714040000_phase3_parts_atomic_commands.sql",
  );
  const quantities = source(
    "supabase/migrations/20260714040100_phase3_parts_quantity_reconciliation.sql",
  );
  const lineDisposition = source(
    "supabase/migrations/20260714040200_phase3_atomic_line_void.sql",
  );
  const snapshots = source(
    "supabase/migrations/20260714040300_phase3_part_identity_snapshots.sql",
  );

  it("enforces tenant operation uniqueness", () => {
    expect(atomic).toContain("unique (shop_id, operation_key)");
    expect(atomic).toContain("Operation key must be tenant scoped");
  });

  it("locks affected rows and checks financial state", () => {
    for (const sql of [atomic, quantities, lineDisposition, snapshots]) {
      expect(sql).toContain("for update");
      expect(sql).toContain("parts_assert_work_order_mutable");
    }
  });

  it("protects quantity ceilings", () => {
    expect(quantities).toContain("Receipt exceeds ordered quantity");
    expect(quantities).toContain("Cannot return more than consumed");
    expect(quantities).toContain("Cannot issue more than allocated quantity");
    expect(quantities).toContain("Ordered quantity % exceeds requested quantity %");
  });

  it("keeps purchasing and fulfillment quantities distinct", () => {
    expect(quantities).toContain("add column if not exists qty_assigned");
    expect(quantities).toContain("add column if not exists qty_ordered");
    expect(quantities).toContain("add column if not exists qty_returned");
    expect(quantities).not.toContain("qty_approved=greatest");
  });

  it("rereads replacement state under locks", () => {
    expect(quantities).toContain(
      "where source_parts_request_item_id = p_request_item_id and is_active",
    );
    expect(quantities).toContain(
      "must be fully returned before replacement",
    );
  });

  it("records every line disposition category", () => {
    expect(lineDisposition).toContain("allocation_released");
    expect(lineDisposition).toContain("open_order_cancelled");
    expect(lineDisposition).toContain("received_retained_for_inventory");
    expect(lineDisposition).toContain("consumed_returned_to_stock");
    expect(lineDisposition).toContain("consumed_kept_internal");
    expect(lineDisposition).toContain("consumed_scrapped");
  });

  it("uses net issued quantity and separate identity snapshots", () => {
    expect(snapshots).toContain(
      "quantity_consumed, 0) - coalesce(wop.quantity_returned, 0)",
    );
    for (const field of [
      "manufacturer_snapshot",
      "supplier_snapshot",
      "vendor_snapshot",
      "part_number_snapshot",
      "sku_snapshot",
      "unit_cost_snapshot",
      "unit_sell_price_snapshot",
    ]) {
      expect(snapshots).toContain(field);
    }
  });
});
