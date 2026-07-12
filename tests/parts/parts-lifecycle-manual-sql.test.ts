import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync("db/sql/2026-07-11_parts_lifecycle_consolidated_manual.sql", "utf8");
const preflight = readFileSync("db/sql/2026-07-11_parts_lifecycle_manual_preflight.sql", "utf8");
const postcheck = readFileSync("db/sql/2026-07-11_parts_lifecycle_manual_postcheck.sql", "utf8");
const audit = readFileSync("db/sql/2026-07-11_parts_lifecycle_readonly_audit.sql", "utf8");

describe("manual consolidated parts lifecycle SQL", () => {
  it("is a single transactional final-state migration without known-bad intermediate patterns", () => {
    expect(migration.trim().toLowerCase()).toMatch(/^--[\s\S]*\bbegin;/);
    expect(migration.trim().toLowerCase()).toMatch(/commit;$/);
    expect(migration).toContain("drop index if exists public.uq_stock_moves_reference_reason");
    expect(migration).not.toMatch(/create\s+(unique\s+)?index[^;]*uq_stock_moves_reference_reason/i);
    expect(migration).not.toMatch(/'wo_allocate'[^;]*-p_qty/);
    expect(migration).toContain("lifecycle_quantity numeric");
    expect(migration).toContain("work_order_part_id uuid");
  });

  it("uses direct work-order-part relationships and active-only replacement history", () => {
    expect(migration).toContain("uq_work_order_parts_active_source_request_item");
    expect(migration).toContain("uq_wopa_work_order_part_location");
    expect(migration).toContain("replaced_from_work_order_part_id");
    expect(migration).toContain("replaced_by_work_order_part_id");
    expect(migration).toContain("parts_validate_replacement_links");
    expect(migration).not.toMatch(/work_order_parts[\s\S]{0,120}set[\s\S]{0,80}part_id\s*=\s*p_new_part_id/i);
  });

  it("defines final canonical balance functions and RPCs", () => {
    for (const fn of [
      "parts_attach_request_item",
      "parts_allocate_request_item",
      "parts_release_allocation",
      "parts_create_po_line_for_request",
      "parts_receive_request_item",
      "parts_issue_work_order_part",
      "parts_return_to_stock",
      "parts_cancel_request_item",
      "parts_replace_request_item",
      "upsert_part_allocation_from_request_item",
    ]) expect(migration).toContain(`function public.${fn}`);
    expect(migration).toContain("sm.reason not in ('wo_allocate','wo_release')");
    expect(migration).toContain("public.parts_on_hand");
    expect(migration).toContain("public.parts_allocated");
    expect(migration).toContain("public.parts_available");
  });

  it("hardens SECURITY DEFINER execution", () => {
    expect(migration).toContain("set search_path = public");
    expect(migration).toContain("parts_lifecycle_assert_shop_access");
    expect(migration).toContain("Authentication required");
    expect(migration).toContain("User is not authorized for parts lifecycle operations");
    expect(migration).toContain("revoke all on function public.parts_allocate_request_item");
    expect(migration).toContain("grant execute on function public.parts_allocate_request_item");
  });

  it("ships read-only preflight/postcheck/audit scripts with real findings", () => {
    expect(preflight).toContain("allocation_backfill_ambiguous");
    expect(preflight).toContain("active_duplicate_work_order_parts_per_request_item");
    expect(postcheck).toContain("missing_required_columns");
    expect(postcheck).toContain("lifecycle_functions_executable_by_anon");
    expect(postcheck).toContain("invoice_parts_missing_canonical_work_order_part_refs");
    expect(audit).toContain("with recursive stock_balances");
    for (const sql of [preflight, postcheck, audit]) {
      expect(sql).not.toMatch(/hardcoded/i);
      expect(sql).not.toMatch(/select\s+'[^']+'\s+finding,\s*0\b/i);
    }
  });
});
