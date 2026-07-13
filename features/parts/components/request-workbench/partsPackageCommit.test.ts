import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolvePackageCommitQuantity } from "@/features/parts/server/resolvePackageCommitQuantity";

type QuantityItem = Parameters<typeof resolvePackageCommitQuantity>[0];

function item(qty_requested: unknown, qty: unknown): QuantityItem {
  return { qty_requested, qty } as QuantityItem;
}

describe("parts package commit quantity resolution", () => {
  it("falls back from qty_requested zero to legacy qty for a single oil filter", () => {
    expect(resolvePackageCommitQuantity(item(0, 1))).toBe(1);
  });

  it("falls back from qty_requested zero to legacy qty for six quarts of oil", () => {
    expect(resolvePackageCommitQuantity(item(0, 6))).toBe(6);
  });

  it("uses positive qty_requested before legacy qty", () => {
    expect(resolvePackageCommitQuantity(item(2, 6))).toBe(2);
  });

  it("honestly treats zero or invalid quantities as not committable", () => {
    expect(resolvePackageCommitQuantity(item(0, 0))).toBe(0);
    expect(resolvePackageCommitQuantity(item("bad", "also-bad"))).toBe(0);
    expect(resolvePackageCommitQuantity(item(-1, -6))).toBe(0);
  });
});

describe("parts package commit route safeguards", () => {
  const commitRoute = readFileSync("app/api/parts/requests/[requestId]/commit-package/route.ts", "utf8");

  it("commits selected items through the request-level helper without allocation, PO, stock movement, or menu learning", () => {
    expect(commitRoute).toContain("parts_ensure_work_order_part");
    expect(commitRoute).toContain("source_parts_request_item_id");
    expect(commitRoute).not.toContain("purchase_order");
    expect(commitRoute).not.toContain("stock_movements");
    expect(commitRoute).not.toContain("upsert_part_allocation_from_request_item");
    expect(commitRoute).not.toContain("upsertMenuRepairItem");
  });

  it("checks existing source item linkage so repeated save remains idempotent", () => {
    expect(commitRoute).toContain("existingByItemId");
    expect(commitRoute).toContain('status: "already_committed"');
  });

  it("allows multiple selected items on the same repair line to be processed together", () => {
    expect(commitRoute).toContain("for (const item of items)");
    expect(commitRoute).toContain("work_order_line_id");
    expect(commitRoute).not.toContain("break;");
  });
});

describe("part request item live-schema compatibility", () => {
  it("does not select nonexistent quote_line_id from current part_request_items queries", () => {
    const files = [
      "app/api/parts/requests/items/[itemId]/edit/route.ts",
      "app/api/parts/requests/[requestId]/commit-package/route.ts",
    ];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/from\("part_request_items"\)[\s\S]{0,180}select\("[^"]*quote_line_id/);
    }
  });
});
