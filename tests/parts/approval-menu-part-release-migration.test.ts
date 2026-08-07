import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260804130000_fix_approval_menu_part_release.sql",
  "utf8",
);

describe("approval-time menu parts release migration", () => {
  it("uses source work-order-part identity for canonical request items", () => {
    expect(migration).toContain(
      "uq_pri_request_source_work_order_part",
    );
    expect(migration).toContain(
      "on public.part_request_items(request_id, source_work_order_part_id)",
    );
    expect(migration.match(/and source_work_order_part_id is null/g)).toHaveLength(2);
  });

  it("preserves the legacy line-level duplicate guards", () => {
    expect(migration).toContain("create unique index uq_pri_line_part");
    expect(migration).toContain("create unique index uq_pri_line_desc_nullpart");
    expect(migration).toContain("lower(trim(description))");
    expect(migration).toContain("and approved is true");
  });

  it("stages durable menu identity and pricing snapshots going forward", () => {
    expect(migration).toContain(
      "function public.wol_copy_menu_parts_to_work_order_parts()",
    );
    for (const column of [
      "description_snapshot",
      "part_number_snapshot",
      "manufacturer_snapshot",
      "unit_cost_snapshot",
      "unit_sell_price_snapshot",
    ]) {
      expect(migration).toContain(column);
    }
    expect(migration).toContain("'Menu part ' || left(mip.id::text, 8)");
    expect(migration).toContain("create trigger trg_wol_copy_menu_parts");
    expect(migration).toContain("p.price,\n          p.default_price");
  });

  it("repairs only safe one-to-one historical menu matches", () => {
    expect(migration).toContain("with menu_candidates as");
    expect(migration).toContain("join public.menu_item_parts mip");
    expect(migration).toContain(
      "where nullif(trim(wop.description_snapshot), '') is null",
    );
    expect(migration).toContain("menu.match_count = 1");
    expect(migration).toContain("wop.match_count = 1");
    expect(migration).toContain("not public.work_order_is_financially_locked");
    expect(migration).not.toContain("row_number()");
  });

  it("contains no production row identifiers", () => {
    expect(migration).not.toMatch(
      /a2be3728|d29739dd|e8f0dd57|e9e87cda/i,
    );
  });
});
