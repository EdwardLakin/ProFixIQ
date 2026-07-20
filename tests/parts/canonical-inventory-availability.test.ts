import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260719160000_canonical_inventory_availability.sql",
  "utf8",
);
const pickTaskRoute = readFileSync(
  "app/api/parts/requests/pick-task/route.ts",
  "utf8",
);
const partsImport = readFileSync(
  "features/integrations/imports/runPartsImportPipeline.ts",
  "utf8",
);
const reviewMaterialization = readFileSync(
  "features/integrations/shopBoost/reviewMaterialization.ts",
  "utf8",
);
const snapshotHelper = readFileSync(
  "features/parts/server/setStockOnHandSnapshot.ts",
  "utf8",
);

describe("canonical inventory availability", () => {
  it("builds the picking view from the physical ledger minus active allocations", () => {
    expect(migration).toContain("create or replace view public.v_part_stock");
    expect(migration).toContain("with (security_invoker = true)");
    expect(migration).toContain("from public.stock_moves sm");
    expect(migration).toContain("from public.work_order_part_allocations a");
    expect(migration).toContain(
      "coalesce(p.qty_on_hand, 0) - coalesce(a.qty_reserved, 0)",
    );
    expect(pickTaskRoute).toContain('.from("v_part_stock")');
  });

  it("reconciles only snapshot-only positive stock with a replay-safe key", () => {
    expect(migration).toContain("where ps.qty_on_hand > 0");
    expect(migration).toContain(
      "and coalesce(lo.physical_move_count, 0) = 0",
    );
    expect(migration).toContain(
      "lock table public.stock_moves in share row exclusive mode",
    );
    expect(migration).toContain(":canonical-stock-backfill:");
    expect(migration).toContain("on conflict (shop_id, idempotency_key)");
    expect(migration).not.toMatch(
      /snapshot_gaps[\s\S]*delete\s+from\s+public\.stock_moves/i,
    );
  });

  it("provides a tenant-scoped idempotent snapshot command", () => {
    expect(migration).toContain(
      "function public.parts_set_stock_on_hand_snapshot",
    );
    expect(migration).toContain("parts_lifecycle_assert_shop_access");
    expect(migration).toContain("and shop_id = p_shop_id");
    expect(migration).toContain(
      "Inventory snapshot idempotency key must be tenant scoped.",
    );
    expect(migration).toContain("auth.role(), '') <> 'service_role'");
    expect(migration).toContain(
      "reused with a different target quantity",
    );
    expect(migration).toContain("to authenticated, service_role");
    expect(migration).toContain(
      "revoke all on function public.parts_set_stock_on_hand_snapshot",
    );
  });

  it("routes both import paths through the canonical snapshot command", () => {
    for (const source of [partsImport, reviewMaterialization]) {
      expect(source).toContain("setStockOnHandSnapshot");
      expect(source).not.toContain('.from("part_stock")');
    }
    expect(partsImport).not.toContain("qty_delta");
    expect(partsImport).not.toContain("shop_boost_snapshot_seed");
    expect(snapshotHelper).toContain("parts_set_stock_on_hand_snapshot");
    expect(snapshotHelper).toContain("throw new Error");
  });
});
