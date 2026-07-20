import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260720032000_fix_first_request_item_allocation.sql",
  "utf8",
);

describe("first request-item allocation", () => {
  it("materializes and reads the canonical work-order part in separate statements", () => {
    expect(migration).toContain(
      "v_wop_id := public.parts_attach_request_item(p_request_item_id);",
    );
    expect(migration).toMatch(
      /select \* into v_wop\s+from public\.work_order_parts\s+where id = v_wop_id\s+for update;/,
    );
    expect(migration).not.toMatch(
      /where id\s*=\s*public\.parts_attach_request_item\(/,
    );
  });

  it("rejects a missing or mismatched materialization before checking stock", () => {
    expect(migration).toContain(
      "Canonical work-order part was not materialized.",
    );
    expect(migration).toContain(
      "v_wop.shop_id is distinct from v_item.shop_id",
    );
    expect(migration).toContain(
      "v_wop.part_id is distinct from v_item.part_id",
    );
  });

  it("checks and records inventory with the request item's canonical scope", () => {
    expect(migration).toContain(
      "v_item.shop_id,\n    v_item.part_id,\n    p_location_id",
    );
    expect(migration).toContain(
      "v_item.part_id, p_location_id, 0, 'wo_allocate'",
    );
    expect(migration).toContain("for update");
    expect(migration).toContain("idempotency_key = p_idempotency_key");
  });
});
