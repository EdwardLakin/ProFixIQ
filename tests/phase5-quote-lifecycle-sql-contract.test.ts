import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const approvalSql = read(
  "supabase/migrations/20260715060000_phase5_atomic_quote_decisions.sql",
);
const importSql = read(
  "supabase/migrations/20260715060100_phase5_atomic_inspection_quote_import.sql",
);
const postcheck = read(
  "supabase/migrations/20260715060200_phase5_quote_lifecycle_postcheck.sql",
);

describe("Phase 5 quote lifecycle SQL contract", () => {
  it("makes customer quote decisions one locked idempotent transaction", () => {
    expect(approvalSql).toContain("apply_customer_quote_decision_atomic");
    expect(approvalSql).toContain("quote_lifecycle_operation_keys");
    expect(approvalSql.toLowerCase()).toContain("for update");
    expect(approvalSql).toContain("FINANCIALLY_LOCKED");
    expect(approvalSql).toContain("PART_RELINK_CONFLICT");
    expect(approvalSql).toContain("p_decline_remaining");
  });

  it("materializes authorization as awaiting rather than active labor", () => {
    expect(approvalSql).toContain("'awaiting'");
    expect(approvalSql).toContain("'authorized'");
    expect(approvalSql).toContain("'approved'");
    expect(approvalSql).not.toMatch(
      /insert into public\.work_order_lines[\s\S]{0,2000}'in_progress'/,
    );
  });

  it("relinks quote-originated parts inside the same command", () => {
    expect(approvalSql).toContain("update public.part_requests");
    expect(approvalSql).toContain("update public.part_request_items");
    expect(approvalSql).toContain("quote_line_id = v_quote.id");
  });

  it("anchors inspection imports before any quote or parts writes", () => {
    expect(importSql).toContain("INSPECTION_UNANCHORED");
    expect(importSql).toContain("INSPECTION_WORK_ORDER_MISMATCH");
    expect(importSql).toContain("INSPECTION_SOURCE_LINE_MISMATCH");
    expect(importSql).toContain("INSPECTION_VEHICLE_MISMATCH");
    expect(importSql.toLowerCase()).toContain("for update");
    expect(importSql.indexOf("INSPECTION_UNANCHORED")).toBeLessThan(
      importSql.indexOf("insert into public.work_order_quote_lines"),
    );
  });

  it("creates quote lines and required parts under one RPC", () => {
    expect(importSql).toContain("insert into public.work_order_quote_lines");
    expect(importSql).toContain("insert into public.part_requests");
    expect(importSql).toContain("insert into public.part_request_items");
    expect(importSql).toContain("inspection_finding_identity");
  });

  it("has a fail-fast compatibility postcheck", () => {
    expect(postcheck).toContain("work_order_is_financially_locked");
    expect(postcheck).toContain("inspection anchor columns are missing");
    expect(postcheck).toContain(
      "Phase 5 quote and inspection lifecycle postcheck passed.",
    );
  });
});
