import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const migrationPath =
  "supabase/migrations/20261011003522_fix_inspection_quote_approval_source_line.sql";
const repairPath =
  "db/sql/2026-10-10_repair_wo_000001_inspection_quote_materialization.sql";

describe("inspection quote approval source-line regression", () => {
  it("only reuses a source line that is a repair job, never the inspection", () => {
    const migration = read(migrationPath).toLowerCase();

    expect(migration).toContain(
      "create or replace function public.quote_line_source_line_is_reusable",
    );
    expect(migration).toContain("p_metadata ->> 'source_inspection_id'");
    expect(migration).toContain("= 'inspection'");
    expect(migration).toContain("security invoker");
    expect(migration).toContain(
      "from public, anon, authenticated",
    );
  });

  it("patches the customer decision engine to materialize its own line", () => {
    const migration = read(migrationPath);

    expect(migration).toContain(
      "public.apply_customer_quote_decision_engine_atomic(uuid,uuid,uuid[],text,boolean,uuid,uuid,text,timestamptz)",
    );
    expect(migration).toContain(
      "v_work_order_line_id := coalesce(v_quote.work_order_line_id, v_quote.source_work_order_line_id);",
    );
    expect(migration).toContain("public.quote_line_source_line_is_reusable(");
  });

  it("maps quote job types rejected by work_order_lines_job_type_check", () => {
    const migration = read(migrationPath);

    for (const allowed of [
      "diagnosis",
      "inspection",
      "maintenance",
      "repair",
      "tech-suggested",
    ]) {
      expect(migration).toContain(`\\'${allowed}\\'`);
    }
    expect(migration).toContain("else \\'repair\\'");
  });

  it("stops the approval trigger from activating an inspection source line", () => {
    const migration = read(migrationPath);

    expect(migration).toContain(
      "public.activate_source_work_order_line_from_quote()",
    );
    expect(migration).toContain("if new.source_work_order_line_id is null");
    expect(migration).toContain("Source work-order line activation trigger");
  });

  it("keeps the WO-000001 repair idempotent and guarded", () => {
    const repair = read(repairPath);

    expect(repair).toContain("e4c5d0a8-6c15-44a2-9d00-0928c7d835c8");
    expect(repair).toContain(
      "work_order_line_id is distinct from v_quote.source_work_order_line_id",
    );
    expect(repair).toContain("is not inspection-sourced; refusing to repair");
    expect(repair).toContain(
      "disable trigger trg_prevent_part_request_item_anchor_changes",
    );
    expect(repair).toContain(
      "enable trigger trg_prevent_part_request_item_anchor_changes",
    );
    expect(repair).toContain("WO repair postcheck failed");
  });

  it("orders the repair after the migration it depends on", () => {
    const repair = read(repairPath);

    expect(repair).toContain("20261011003522_fix_inspection_quote_approval_source_line");
  });
});
