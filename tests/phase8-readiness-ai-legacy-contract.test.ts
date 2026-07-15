import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const readySql = read(
  "supabase/migrations/20260715090100_phase8_atomic_mark_ready.sql",
);
const aiSql = read(
  "supabase/migrations/20260715090200_phase8_atomic_ai_suggested_quotes.sql",
);
const readyRoute = read("app/api/work-orders/[id]/mark-ready/route.ts");
const suggestionsRoute = read("app/api/work-orders/add-suggested-lines/route.ts");
const legacyStatusRoute = read("app/api/work-orders/update-status/route.ts");
const legacyAiLineRoute = read("app/api/work-orders/add-line/route.ts");
const legacyInspectionRoute = read(
  "app/api/work-orders/lines/update-from-inspection/route.ts",
);

describe("Phase 8 readiness, AI truth, and legacy route closeout", () => {
  it("marks work orders ready under one locked transaction", () => {
    expect(readySql).toContain("mark_work_order_ready_atomic");
    expect(readySql).toContain("for update");
    expect(readySql).toContain("work_order_is_financially_locked");
    expect(readySql).toContain("system_lifecycle_operation_keys");
    expect(readySql).toContain("Active pending quote lines must be resolved");
    expect(readyRoute).toContain('rpc("mark_work_order_ready_atomic"');
    expect(readyRoute).not.toContain('.from("work_orders")');
  });

  it("places selected AI suggestions into quote review without canonical labor or pricing", () => {
    expect(aiSql).toContain("add_ai_suggested_quote_lines_atomic");
    expect(aiSql).toContain("insert into public.work_order_quote_lines");
    expect(aiSql).not.toContain("insert into public.work_order_lines");
    expect(aiSql).toContain("'advisor_pending'");
    expect(aiSql).toContain("'canonical_labor_hours_accepted', false");
    expect(aiSql).toContain("'canonical_pricing_accepted', false");
    expect(suggestionsRoute).toContain(
      '"add_ai_suggested_quote_lines_atomic"',
    );
    expect(suggestionsRoute).not.toContain('.from("work_order_lines")');
  });

  it("retires direct parent, AI line, and inspection line mutation routes", () => {
    for (const source of [
      legacyStatusRoute,
      legacyAiLineRoute,
      legacyInspectionRoute,
    ]) {
      expect(source).toContain("status: 410");
      expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(source).not.toContain('.update(');
      expect(source).not.toContain('.insert(');
    }
  });
});
