import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260720030000_reconcile_starved_inventory_snapshots.sql",
  "utf8",
);

describe("starved canonical inventory reconciliation", () => {
  it("repairs only snapshots that have stock after reservations while the ledger does not", () => {
    expect(migration).toContain(
      "coalesce(l.qty_on_hand, 0) - coalesce(a.qty_reserved, 0) <= 0",
    );
    expect(migration).toContain(
      "ps.qty_on_hand - coalesce(a.qty_reserved, 0) > 0",
    );
    expect(migration).toContain(
      "ps.qty_on_hand > coalesce(l.qty_on_hand, 0)",
    );
    expect(migration).toContain("where s.gap_qty > 0");
  });

  it("uses canonical tenant/location joins and a replay-safe adjustment", () => {
    expect(migration).toContain("and sl.shop_id = p.shop_id");
    expect(migration).toContain("l.shop_id = p.shop_id");
    expect(migration).toContain("a.shop_id = p.shop_id");
    expect(migration).toContain(":canonical-stock-starvation-v1:");
    expect(migration).toContain("on conflict (shop_id, idempotency_key)");
    expect(migration).toContain("do nothing");
  });

  it("does not rewrite or delete inventory history", () => {
    expect(migration).not.toMatch(/delete\s+from\s+public\.stock_moves/i);
    expect(migration).not.toMatch(/update\s+public\.stock_moves/i);
    expect(migration).not.toMatch(/update\s+public\.part_stock/i);
  });
});
