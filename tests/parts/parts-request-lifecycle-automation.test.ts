import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260719100100_parts_request_lifecycle_automation.sql",
  "utf8",
);
const enumMigration = readFileSync(
  "supabase/migrations/20260719100000_part_request_status_enum_completion.sql",
  "utf8",
);
const queue = readFileSync("app/parts/requests/page.tsx", "utf8");
const detail = readFileSync("app/parts/requests/[id]/page.tsx", "utf8");
const createRoute = readFileSync(
  "app/api/parts/requests/create/route.ts",
  "utf8",
);
const handoffRoute = readFileSync(
  "app/api/parts/requests/[requestId]/handoff/route.ts",
  "utf8",
);
const operationsDashboard = readFileSync(
  "features/dashboard/server/getOperationsDashboardPayload.ts",
  "utf8",
);

describe("parts request lifecycle automation", () => {
  it("reconciles every lifecycle writer through one database-backed transition", () => {
    expect(migration).toContain(
      "function public.parts_reconcile_request_lifecycle",
    );
    expect(migration).toContain("trg_parts_reconcile_request_from_item");
    expect(migration).toContain("trg_parts_reconcile_quote_decision");
    expect(migration).toContain("trg_parts_reconcile_line_approval");
    expect(migration).toContain("v_new_status := 'quoted'");
    expect(migration).toContain("v_new_status := 'approved'");
    expect(migration).toContain("v_new_status := 'fulfilled'");
  });

  it("inherits approved direct lines while quote-origin requests still wait", () => {
    expect(migration).toContain("v_preapproved boolean := false");
    expect(migration).toContain(
      "case when v_preapproved then 'approved'::public.part_request_status",
    );
    expect(migration).toContain("v_quote_approved then");
    expect(migration).toContain("v_quote_declined then");
    expect(migration).toContain("v_quote_deferred then");
  });

  it("validates and tenant-scopes request creation and handoff commands", () => {
    expect(createRoute).toContain("requireShopScopedApiAccess");
    expect(createRoute).toContain("isUuid(workOrderId)");
    expect(createRoute).toContain('.eq("shop_id", shopId)');
    expect(handoffRoute).toContain("requireShopScopedApiAccess");
    expect(handoffRoute).toContain("rawKey.length > 160");
    expect(migration).toContain("Parts handoff actor mismatch");
  });

  it("blocks package, PO, and stock operations before approval", () => {
    expect(migration).toContain("PARTS_APPROVAL_REQUIRED");
    expect(migration).toContain(
      "trg_parts_require_request_release_for_item_operation",
    );
    expect(migration).toContain("trg_parts_require_request_release_for_wop");
    expect(migration).toContain(
      "trg_parts_require_request_release_for_po_line",
    );
    expect(migration).toContain(
      "trg_parts_require_request_release_for_allocation",
    );
    expect(migration).toContain(
      "before insert or update of source_parts_request_item_id, shop_id",
    );
    expect(migration).toContain(
      "before insert or update of part_request_item_id, po_id, qty",
    );
    expect(detail).not.toContain("Fallback: auto-pick first available line");
    expect(detail).toContain("isRequestOperationallyReleased");
  });

  it("publishes one current Parts workflow notice and resolves prior stages", () => {
    expect(migration).toContain("source = 'parts_workflow'");
    expect(migration).toContain("status = 'resolved'");
    expect(migration).toContain("parts_request_needs_quote");
    expect(migration).toContain("parts_quote_awaiting_approval");
    expect(migration).toContain("parts_approved_action_required");
    expect(migration).toContain("parts_ready_for_handoff");
    expect(migration).toContain(
      "revoke all on function public.parts_publish_request_notification",
    );
  });

  it("keeps ordering and issue explicit while making handoff idempotent", () => {
    const reconcileStart = migration.indexOf(
      "function public.parts_reconcile_request_lifecycle",
    );
    const reconcileEnd = migration.indexOf(
      "function public.trg_parts_reconcile_request_from_item",
      reconcileStart,
    );
    const reconcile = migration.slice(reconcileStart, reconcileEnd);
    expect(reconcile).not.toContain("parts_create_po_line_for_request");
    expect(reconcile).not.toContain("parts_allocate_request_item");
    expect(reconcile).not.toContain("parts_issue_work_order_part");
    expect(migration).toContain(
      "function public.parts_complete_request_handoff_atomic",
    );
    expect(migration).toContain("parts_request_handoff_keys");
    expect(migration).toContain("PARTS_HANDOFF_REQUIRED");
    expect(migration).toContain(
      "p_shop_id::text || ':parts-handoff:' || p_request_id::text || ':'",
    );
    expect(migration).toContain(
      "A simultaneous retry can pass the first absent-key check",
    );
  });

  it("renders four active columns, separate history, and exact count units", () => {
    for (const stage of [
      "needs_quote",
      "awaiting_approval",
      "order_receive",
      "ready_for_tech",
    ]) {
      expect(queue).toContain(stage);
    }
    expect(queue).toContain('type QueueTab = "active" | "completed"');
    expect(queue).toContain('label={tab === "active" ? "Open requests"');
    expect(queue).not.toContain("Delete");
    expect(operationsDashboard).toContain(
      "row.work_order_id ?? `request:${row.id}`",
    );
    expect(operationsDashboard).toContain('label: "Jobs with open parts"');
  });

  it("adds the enum values required by real ordering and return writers", () => {
    for (const value of [
      "partially_ordered",
      "partially_consumed",
      "partially_returned",
      "returned",
    ]) {
      expect(enumMigration).toContain(
        `part_request_item_status add value if not exists '${value}'`,
      );
    }
    expect(enumMigration).toContain(
      "part_request_status add value if not exists 'deferred'",
    );
  });
});
