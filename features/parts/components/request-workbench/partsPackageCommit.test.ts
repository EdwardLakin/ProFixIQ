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
  const commitMigration = readFileSync(
    "supabase/migrations/20260714040000_phase3_parts_atomic_commands.sql",
    "utf8",
  );

  it("commits the complete request through a shop-scoped atomic command", () => {
    expect(commitRoute).toContain('requiredCapability: "canManageWorkOrders"');
    expect(commitRoute).toContain('"parts_commit_request_package_atomic"');
    expect(commitRoute).toContain("p_shop_id: access.profile.shop_id");
    expect(commitMigration).toContain("public.parts_ensure_work_order_part(v_item.id)");
    expect(commitRoute).not.toContain("purchase_order");
    expect(commitRoute).not.toContain("stock_movements");
    expect(commitRoute).not.toContain("upsert_part_allocation_from_request_item");
    expect(commitRoute).not.toContain("upsertMenuRepairItem");
  });

  it("requires a stable key and replays completed operations idempotently", () => {
    expect(commitRoute).toContain("A stable idempotency key is required.");
    expect(commitRoute).toContain(":commit-package:");
    expect(commitMigration).toContain("public.parts_begin_operation(");
    expect(commitMigration).toContain("if v_operation.completed_at is not null then");
    expect(commitMigration).toContain("'idempotent', true");
  });

  it("locks and validates every selected item before attaching the package", () => {
    expect(commitMigration).toContain("Lock the complete package before validation or attachment.");
    expect(commitMigration).toContain("Validate every item before creating any work-order part.");
    expect(commitMigration.match(/for v_item in/g)).toHaveLength(2);
    expect(commitMigration).toContain("for update");
    expect(commitMigration).toContain("parts_assert_work_order_mutable");
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
