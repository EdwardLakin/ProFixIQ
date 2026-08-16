import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260816192840_field_purchase_order_review_fixes.sql",
  "utf8",
);
const placeRoute = readFileSync(
  "app/api/parts/purchase-orders/[poId]/place/route.ts",
  "utf8",
);
const workflow = readFileSync(
  "features/parts/mobile/MobilePurchaseOrders.tsx",
  "utf8",
);

describe("Field purchase-order review contract", () => {
  it("places a non-empty PO under one PO-first database transaction", () => {
    const poLock = migration.indexOf("from public.purchase_orders purchase_order");
    const lineLock = migration.indexOf("from public.purchase_order_lines line");
    expect(migration).toContain(
      "create or replace function public.parts_place_purchase_order",
    );
    expect(poLock).toBeGreaterThan(-1);
    expect(lineLock).toBeGreaterThan(poLock);
    expect(migration).toContain("order by line.created_at, line.id");
    expect(migration).toContain("for update;");
    expect(migration).toContain("Add at least one active line before placing this PO.");
    expect(placeRoute).toContain('"parts_place_purchase_order"');
    expect(placeRoute).not.toContain('.from("purchase_order_lines")');
  });

  it("composes canonical quote contact auditing during placement", () => {
    expect(migration).toContain(
      "public.parts_mark_purchase_order_contacted(",
    );
    expect(migration).toContain("v_po.supplier_quote_request_id is not null");
    expect(workflow).toContain("supplier_quote_request_id");
    expect(workflow).toContain("contactChannel");
  });

  it("hardens PO-line precision and preserves notes when a draft is reused", () => {
    expect(migration).toContain("p_qty <> round(p_qty, 2)");
    expect(migration).toContain("Purchase order supplier is inactive.");
    expect(migration).toContain("if not v_created");
    expect(migration).toContain("set notes = concat_ws(");
    expect(migration).toContain("nullif(trim(p_notes), '')");
  });

  it("keeps the new lifecycle command tenant-authorized and least-privileged", () => {
    expect(migration).toContain("parts_lifecycle_assert_shop_access(v_po.shop_id)");
    expect(migration).toContain("profile.shop_id = v_po.shop_id");
    expect(migration).toContain("profile.id = auth.uid()");
    expect(migration).toContain("profile.user_id = auth.uid()");
    expect(migration).toContain(
      "revoke all on function public.parts_place_purchase_order",
    );
    expect(migration).toContain("to authenticated, service_role");
  });
});
