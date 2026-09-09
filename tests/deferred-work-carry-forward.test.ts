import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260909163000_carry_forward_deferred_work.sql",
  "utf8",
);
const route = readFileSync(
  "app/api/work-orders/deferred-history/route.ts",
  "utf8",
);
const panel = readFileSync(
  "features/work-orders/app/work-orders/create/PreviousDeferredWorkPanel.tsx",
  "utf8",
);
const wrapper = readFileSync(
  "features/work-orders/app/work-orders/create/ShopCreateWorkOrderPage.tsx",
  "utf8",
);

describe("deferred work carry-forward", () => {
  it("extends the existing canonical line-status contract without rewriting legacy declined behavior", () => {
    expect(migration).toContain("'completed', 'invoiced', 'deferred'");
    expect(migration).toContain("when 'declined' then 'on_hold'");
    expect(migration).toContain("'deferred'::text");
  });

  it("carries prior decisions in the same transaction as work-order creation", () => {
    expect(migration).toContain("after insert on public.work_orders");
    expect(migration).toContain("'deferred',\n      'declined'");
    expect(migration).toContain("source_work_order_line_id");
    expect(migration).toContain("source_row_id");
    expect(migration).toContain("existing.work_order_id = new.id");
  });

  it("stops carrying a recommendation after a linked descendant is completed", () => {
    expect(migration).toContain("descendant_quote.source_work_order_line_id");
    expect(migration).toContain("'completed', 'ready_to_invoice', 'invoiced'");
  });

  it("keeps the carry-forward trigger private instead of exposing a direct RPC bypass", () => {
    expect(migration).toContain(
      "revoke all on function public.carry_forward_deferred_work_for_work_order()",
    );
    expect(migration).not.toContain(
      "grant execute on function public.carry_forward_deferred_work_for_work_order() to authenticated",
    );
  });
});

describe("create-work-order deferred history", () => {
  it("uses a shop-authorized server projection and exposes prior quote totals", () => {
    expect(route).toContain("requireShopScopedApiAccess");
    expect(route).toContain('.eq("shop_id", access.profile.shop_id)');
    expect(route).toContain("grandTotal: Number(original.grand_total ?? 0)");
    expect(route).toContain("partsTotal: Number(original.parts_total ?? 0)");
    expect(route).toContain("laborTotal: Number(original.labor_total ?? 0)");
  });

  it("renders the previous deferred-work panel in the existing shop create wrapper", () => {
    expect(wrapper).toContain("PreviousDeferredWorkPanel");
    expect(panel).toContain("Previous deferred work");
    expect(panel).toContain("Last quoted");
    expect(panel).toContain("grandTotal");
    expect(panel).toContain("license_plate");
    expect(panel).toContain("unit_number");
  });
});
