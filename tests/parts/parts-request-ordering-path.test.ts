import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const detailPage = readFileSync("app/parts/requests/[id]/page.tsx", "utf8");
const addRoute = readFileSync(
  "app/api/parts/requests/items/[itemId]/add/route.ts",
  "utf8",
);
const poLineRoute = readFileSync(
  "app/api/parts/requests/items/[itemId]/po-line/route.ts",
  "utf8",
);
const orderingMigration = readFileSync(
  "supabase/migrations/20260719100200_parts_ordering_path_hardening.sql",
  "utf8",
);

describe("parts request ordering path", () => {
  it("uses the canonical idempotent PO-line command instead of a browser insert", () => {
    expect(detailPage).toContain("/po-line");
    expect(detailPage).toContain("calculateOrderCoverage");
    expect(detailPage).not.toContain('.from("purchase_order_lines").insert');
    expect(poLineRoute).toContain('"parts_create_po_line_for_request"');
    expect(poLineRoute).toContain("p_idempotency_key");
  });

  it("provides stable idempotency keys for attach, allocation, and ordering", () => {
    expect(detailPage).toContain("idempotencyKey: attachIdempotencyKey");
    expect(detailPage).toContain('"attach-partial-stock"');
    expect(detailPage).toContain('"request-order"');
  });

  it("reloads the canonical request item after the atomic attach command", () => {
    expect(addRoute).toContain('.from("part_request_items")');
    expect(addRoute).toContain('.eq("shop_id", access.profile.shop_id)');
    expect(addRoute).toContain("{ ...asRecord(data), ok: true, item }");
  });

  it("does not regress an approved request back to quoted in local UI state", () => {
    expect(detailPage).toContain("mayReconcileQuoteStatus");
    expect(detailPage).toContain("allNowQuoted && mayReconcileQuoteStatus");
    expect(detailPage).not.toContain('status: allNowQuoted ? "quoted"');
  });

  it("only allocates the full quantity atomically when stock covers it", () => {
    expect(detailPage).toContain("const shouldAllocateFromStock = allocationQty >= qty");
    expect(detailPage).toContain("const hasPartialStock = allocationQty > 0 && allocationQty < qty");
  });

  it("restores tenant and role checks inside the security-definer ordering command", () => {
    expect(orderingMigration).toContain("parts_lifecycle_assert_shop_access(v_item.shop_id)");
    expect(orderingMigration).toContain("Parts ordering actor is not authorized for this shop");
    expect(orderingMigration).toContain("parts_request_is_operationally_released");
    expect(orderingMigration).toContain("from public, anon");
  });

  it("blocks mutation of submitted POs and counts only active ordered quantity", () => {
    expect(orderingMigration).toContain("not in ('draft', 'open')");
    expect(orderingMigration).toContain("coalesce(pol.cancelled_qty, 0)");
    expect(orderingMigration).toContain("v_total_ordered > v_target");
  });
});
