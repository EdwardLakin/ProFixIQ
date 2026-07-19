import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/202607130001_parts_request_rls_and_legacy_trigger_reconciliation.sql",
  "utf8",
);
const audit = readFileSync("db/sql/2026-07-13_parts_request_legacy_trigger_reconciliation_audit.sql", "utf8");
const inventoryRoute = readFileSync("app/api/parts/requests/items/[itemId]/inventory/route.ts", "utf8");
const requestPage = readFileSync("app/parts/requests/[id]/page.tsx", "utf8");
const commitRoute = readFileSync("app/api/parts/requests/[requestId]/commit-package/route.ts", "utf8");
const lifecycleSql = readFileSync("db/sql/2026-07-11_parts_lifecycle_completion.sql", "utf8");

describe("parts request RLS and legacy trigger reconciliation", () => {
  it("replaces requester-only UPDATE RLS with same-shop parent request USING and WITH CHECK", () => {
    expect(migration).toContain("cmd = 'UPDATE'");
    expect(migration).toContain("create or replace function public.can_update_part_request_items");
    expect(migration).toContain("lower(coalesce(p.role, '')) in ('owner', 'admin', 'manager', 'parts')");
    expect(migration).toContain("create policy part_request_items_update_same_shop_parent_request");
    expect(migration).toContain("for update");
    expect(migration).toContain("using (");
    expect(migration).toContain("with check (");
    expect(migration).toContain("from public.part_requests pr");
    expect(migration).toContain("join public.profiles p on p.id = auth.uid()");
    expect(migration).toContain("pr.id = part_request_items.request_id");
    expect(migration).toContain("pr.shop_id = p.shop_id");
    expect(migration).toContain("public.can_update_part_request_items(pr.shop_id)");
    expect(migration).toContain("part_request_items.shop_id = pr.shop_id");
  });

  it("does not admit unauthorized same-shop technician or advisor roles to direct updates", () => {
    expect(migration).toContain("in ('owner', 'admin', 'manager', 'parts')");
    expect(migration).not.toContain("'mechanic'");
    expect(migration).not.toContain("'advisor'");
  });

  it("blocks ordinary updates from moving immutable ownership and linkage anchors", () => {
    expect(migration).toContain("create or replace function public.prevent_part_request_item_anchor_changes()");
    for (const column of ["shop_id", "request_id", "work_order_id", "work_order_line_id", "quote_line_id"]) {
      expect(migration).toContain(`new.${column} is distinct from old.${column}`);
    }
    expect(migration).toContain("create trigger trg_prevent_part_request_item_anchor_changes");
    expect(migration).toContain("before update on public.part_request_items");
  });

  it("allows canonical inventory selection route to persist through authorized server path", () => {
    expect(inventoryRoute).toContain("requireShopScopedApiAccess({ requiredCapability: \"canManageWorkOrders\" })");
    expect(inventoryRoute).toContain("part_id: partId");
    expect(inventoryRoute).toContain("updatedItem.part_id !== partId");
  });

  it("does not broaden INSERT policy in this migration", () => {
    expect(migration).not.toMatch(/for\s+insert/i);
    expect(migration).not.toMatch(/part_request_items_insert/i);
  });

  it("drops legacy automatic allocation, pick, consume, unreserve, and recheck triggers only", () => {
    for (const trigger of [
      "trg_pri_approved_reserve_stock",
      "trg_pri_reserved_autopick",
      "trg_pri_picked_consume",
      "trg_pri_auto_unreserve",
      "trg_pri_recheck_line_hold",
    ]) {
      expect(migration).toContain(`drop trigger if exists ${trigger} on public.part_request_items`);
    }
    expect(migration).not.toMatch(/drop\s+trigger[^;]*(updated|linkage)/i);
    expect(migration).not.toMatch(/drop\s+function/i);
  });

  it("ships read-only anomaly diagnostics for duplicate legacy physical movements and stock mismatches", () => {
    expect(audit).toContain("consumed_items_with_multiple_negative_stock_movements");
    expect(audit).toContain("items_with_negative_wo_allocate_and_negative_consume_movements");
    expect(audit).toContain("items_with_duplicate_physical_deductions");
    expect(audit).toContain("part_stock_mismatches_stock_move_on_hand");
    expect(audit).toContain("allocations_inconsistent_with_request_item_reserved_quantities");
    expect(audit).toContain("request_items_consumed_quantity_exceeds_required_quantity");
    expect(audit).not.toMatch(/\b(insert|update|delete|alter|drop|create)\b/i);
  });
});

describe("parts request inventory selection regression", () => {
  it("retains application capability authorization and verifies persisted selected part", () => {
    expect(inventoryRoute).toContain("requireShopScopedApiAccess({ requiredCapability: \"canManageWorkOrders\" })");
    expect(inventoryRoute).toContain(".eq(\"shop_id\", shopId)");
    expect(inventoryRoute).toContain("part_id: partId");
    expect(inventoryRoute).toContain("updatedItem.part_id !== partId");
    expect(inventoryRoute).not.toContain("upsert_part_allocation_from_request_item");
    expect(inventoryRoute).not.toContain("parts_allocate_request_item");
  });

  it("does not leave optimistic selected state when inventory persistence fails", () => {
    const attachHandlerStart = requestPage.indexOf("onAttachInventory={async (");
    const fetchStart = requestPage.indexOf("/api/parts/requests/items/${input.itemId}/inventory", attachHandlerStart);
    const beforePersist = requestPage.slice(attachHandlerStart, fetchStart);
    expect(beforePersist).not.toContain("updateItem(r.req.id, input.itemId");
    expect(beforePersist).toContain("Possible mismatch. Review the selected inventory part");
  });

  it("keeps package save and approval separate from automatic allocation or consumption", () => {
    expect(commitRoute).toContain("parts_commit_request_package_atomic");
    expect(lifecycleSql).toContain("parts_ensure_work_order_part");
    expect(commitRoute).not.toContain("parts_allocate_request_item");
    expect(commitRoute).not.toContain("parts_issue_work_order_part");
    expect(lifecycleSql).toContain("values (v_wop.part_id, p_location_id, 0, 'wo_allocate'");
    expect(lifecycleSql).toContain("values (v_wop.part_id, p_location_id, -p_qty, 'consume'");
    expect(lifecycleSql).toContain("select * into v_existing from public.stock_moves where shop_id=v_wop.shop_id and idempotency_key=p_idempotency_key");
  });
});
