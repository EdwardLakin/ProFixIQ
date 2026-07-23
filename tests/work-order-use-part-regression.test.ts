import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("work order Use Part regression", () => {
  const consumePartSource = readFileSync(
    "features/work-orders/lib/parts/consumePart.ts",
    "utf8",
  );
  const partsDrawerSource = readFileSync(
    "features/parts/components/PartsDrawer.tsx",
    "utf8",
  );
  const handoffEnumCastMigration = readFileSync(
    "supabase/migrations/20260722140500_fix_parts_issue_status_enum_cast.sql",
    "utf8",
  );

  it("accepts the UUID returned by apply_stock_move", () => {
    expect(consumePartSource).toContain(
      'if (typeof data === "string" && data.length > 0) return data;',
    );
    expect(consumePartSource).toContain(
      "apply_stock_move returns a stock move UUID",
    );
  });

  it("surfaces inventory attachment failures from the drawer", () => {
    expect(partsDrawerSource).toContain("throw e;");
  });

  it("casts handoff item statuses to the enum type", () => {
    expect(handoffEnumCastMigration).toContain(
      "v_status public.part_request_item_status;",
    );
    expect(handoffEnumCastMigration).toContain(
      "'partially_consumed'::public.part_request_item_status",
    );
    expect(handoffEnumCastMigration).toContain(
      "'consumed'::public.part_request_item_status",
    );
    expect(handoffEnumCastMigration).toContain("status = v_status");
  });
});
