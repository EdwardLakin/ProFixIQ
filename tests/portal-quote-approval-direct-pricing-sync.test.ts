import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pricingMigrationPath =
  "supabase/migrations/20261010212648_fix_portal_quote_approval_direct_pricing_sync.sql";
const anchorMigrationPath =
  "supabase/migrations/20261010213041_allow_portal_quote_source_line_part_anchor.sql";

describe("portal quote approval direct pricing sync regression", () => {
  it("returns protected pricing before the authenticated-staff guard", () => {
    const migration = readFileSync(pricingMigrationPath, "utf8").toLowerCase();
    const protectedCheck = migration.indexOf("quote_line_pricing_is_protected");
    const protectedReturn = migration.indexOf(
      "'skipped', 'protected_quote_line_state'",
    );
    const staffGuard = migration.indexOf(
      "quote pricing sync is limited to the authenticated staff shop.",
    );

    expect(protectedCheck).toBeGreaterThan(-1);
    expect(protectedReturn).toBeGreaterThan(protectedCheck);
    expect(staffGuard).toBeGreaterThan(protectedReturn);
    expect(migration).toContain("security invoker");
  });

  it("keeps the canonical parts lifecycle direct caller covered", () => {
    const migration = readFileSync(
      "supabase/migrations/20261004120000_portal_parts_quote_requests_foundation.sql",
      "utf8",
    ).toLowerCase();

    expect(migration).toContain(
      "perform public.sync_quote_line_pricing_from_parts(\n      v_request.shop_id,\n      v_request.quote_line_id",
    );
  });

  it("allows approval to anchor parts to the quote's recorded source line", () => {
    const migration = readFileSync(anchorMigrationPath, "utf8").toLowerCase();

    expect(migration).toContain("q.source_work_order_line_id = wol.id");
    expect(migration).toContain("q.id = v_quote_line_id");
    expect(migration).toContain("q.shop_id = new.shop_id");
    expect(migration).toContain("q.work_order_id = new.work_order_id");
    expect(migration).toContain(
      "part_request_items.work_order_line_id cannot be changed",
    );
  });
});
