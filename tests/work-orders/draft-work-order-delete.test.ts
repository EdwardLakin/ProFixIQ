import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  "app/api/work-orders/[id]/delete-draft/route.ts",
  "utf8",
);
const client = readFileSync(
  "features/work-orders/app/work-orders/view/page.tsx",
  "utf8",
);
const migration = readFileSync(
  "supabase/migrations/20260724010000_atomic_draft_work_order_delete.sql",
  "utf8",
);

describe("guarded draft work-order deletion", () => {
  it("routes the UI through one shop-scoped owner/admin command", () => {
    expect(client).toContain("/delete-draft");
    expect(client).not.toMatch(
      /from\("work_order_lines"\)\s*\.delete\(\)[\s\S]{0,180}from\("work_orders"\)\s*\.delete\(\)/,
    );
    expect(route).toContain('allowRoles: ["owner", "admin"]');
    expect(route).toContain('"work_order_delete_draft_atomic"');
    expect(route).toContain("access.profile.shop_id");
  });

  it("requires tenant-scoped idempotency and direct-call authorization", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("WORK_ORDER_DELETE_ACTOR_MISMATCH");
    expect(migration).toContain("WORK_ORDER_DELETE_SHOP_ACCESS_DENIED");
    expect(migration).toContain("WORK_ORDER_DELETE_ROLE_ACCESS_DENIED");
    expect(migration).toContain(
      "p_shop_id::text || ':delete-draft-work-order:'",
    );
    expect(migration).toContain("public.parts_begin_operation");
    expect(migration).toContain("public.parts_complete_operation");
    expect(migration).toContain("'idempotent', true");
  });

  it("refuses operational, parts, labor, inspection, and financial history", () => {
    for (const table of [
      "public.invoices",
      "public.payments",
      "public.supplier_orders",
      "public.work_order_line_labor_segments",
      "public.inspections",
      "public.inspection_sessions",
      "public.work_order_quote_lines",
      "public.work_order_parts",
      "public.part_request_items",
    ]) {
      expect(migration).toContain(table);
    }
    expect(migration).toContain(
      "WORK_ORDER_DELETE_FINANCIAL_OR_APPROVAL_HISTORY",
    );
    expect(migration).toContain("WORK_ORDER_DELETE_ACTIVE_PARTS_HISTORY");
    expect(migration).toContain("WORK_ORDER_DELETE_ACTIVE_LABOR_HISTORY");
  });

  it("removes abandoned request anchors before work-order lines", () => {
    const itemDelete = migration.indexOf(
      "delete from public.part_request_items",
    );
    const requestDelete = migration.indexOf("delete from public.part_requests");
    const lineDelete = migration.indexOf("delete from public.work_order_lines");
    const workOrderDelete = migration.indexOf("delete from public.work_orders");

    expect(itemDelete).toBeGreaterThan(-1);
    expect(itemDelete).toBeLessThan(requestDelete);
    expect(requestDelete).toBeLessThan(lineDelete);
    expect(lineDelete).toBeLessThan(workOrderDelete);
  });
});
