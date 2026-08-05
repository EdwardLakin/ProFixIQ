import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260805162923_remove_legacy_quote_part_auto_anchor.sql",
  "utf8",
);

describe("quote part auto-anchor repair", () => {
  it("removes the legacy oldest-line insert trigger", () => {
    expect(migration).toContain(
      "drop trigger if exists trg_link_part_request_item",
    );
    expect(migration).toContain(
      "drop function if exists public.link_part_request_item_to_line()",
    );
    expect(migration).toContain(
      "Legacy part-request auto-anchor trigger still exists",
    );
  });

  it("repairs only standalone, unreleased quote items", () => {
    expect(migration).toContain("set work_order_line_id = null");
    expect(migration).toContain("and pr.job_id is null");
    expect(migration).toContain("and q.source_work_order_line_id is null");
    expect(migration).toContain("and q.work_order_line_id is null");
    expect(migration).toContain("and q.approved_at is null");
    expect(migration).toContain("and coalesce(pri.qty_ordered, 0) = 0");
    expect(migration).toContain("and coalesce(pri.qty_consumed, 0) = 0");
    expect(migration).toContain("and pri.po_id is null");
    expect(migration).toContain(
      "and not public.work_order_is_financially_locked(",
    );
    expect(migration).toContain("from public.purchase_order_lines pol");
    expect(migration).toContain("from public.work_order_parts wop");
  });

  it("restores the canonical reparenting guard in the same transaction", () => {
    expect(migration).toContain("begin;");
    expect(migration).toContain("commit;");
    expect(migration).toContain(
      "drop trigger if exists trg_prevent_part_request_item_anchor_changes",
    );
    expect(migration).toContain(
      "create trigger trg_prevent_part_request_item_anchor_changes",
    );
    expect(migration).toContain(
      "Canonical part-request anchor guard was not restored",
    );
  });

  it("contains no production row identifiers", () => {
    expect(migration).not.toMatch(
      /cd281ab6|fe089955|7e56a0d2|5287faad|b34acafd|234061e5/i,
    );
  });
});
