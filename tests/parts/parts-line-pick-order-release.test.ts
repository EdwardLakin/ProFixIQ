import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260719143000_parts_line_pick_order_release.sql",
  "utf8",
);
const lineRoute = readFileSync(
  "app/api/work-orders/[id]/lines/[lineId]/parts-request/route.ts",
  "utf8",
);
const pickTaskRoute = readFileSync(
  "app/api/parts/requests/pick-task/route.ts",
  "utf8",
);
const workOrder = readFileSync("app/work-orders/[id]/Client.tsx", "utf8");
const jobCard = readFileSync(
  "features/work-orders/components/JobCard.tsx",
  "utf8",
);
const queue = readFileSync("app/parts/requests/page.tsx", "utf8");
const pickModal = readFileSync(
  "features/parts/components/PickOrderTaskModal.tsx",
  "utf8",
);
const dismissMigration = readFileSync(
  "supabase/migrations/20260720034000_cancel_unmaterialized_request_items.sql",
  "utf8",
);
const receiving = readFileSync("app/parts/receiving/page.tsx", "utf8");
const notifications = readFileSync(
  "features/agent/server/syncAssistantNotifications.ts",
  "utf8",
);

describe("work-order line parts release and Pick / Order flow", () => {
  it("materializes all line parts through one idempotent tenant-scoped command", () => {
    expect(migration).toContain(
      "function public.parts_request_work_order_line_atomic",
    );
    expect(migration).toContain("source_work_order_part_id");
    expect(migration).toContain("for update;");
    expect(migration).toContain("request_work_order_line_parts");
    expect(migration).toContain("NO_LINE_PARTS");
    expect(migration).toContain("parts_begin_operation");
    expect(migration).toContain("parts_reconcile_request_lifecycle");
    expect(migration).toContain("parts_request_is_operationally_released");
  });

  it("automatically releases approved lines and parts added after approval", () => {
    expect(migration).toContain("trg_parts_auto_release_approved_line");
    expect(migration).toContain("trg_parts_auto_release_approved_line_part");
    expect(migration).toContain("line-auto-release:approval:");
    expect(migration).toContain("line-auto-release:part:");
    expect(migration).toContain("approval_state::text");
    expect(migration).toContain("line_status::text");
  });

  it("exposes a one-click line action without allowing cross-shop requests", () => {
    expect(jobCard).toContain("Request all parts");
    expect(jobCard).toContain("onRequestParts");
    expect(workOrder).toContain("requestAllPartsForLine");
    expect(workOrder).toContain("partsRequestActionLabel");
    expect(workOrder).toContain("Idempotency-Key");
    expect(lineRoute).toContain("requireShopScopedApiAccess");
    expect(lineRoute).toContain('.eq("shop_id", access.profile.shop_id)');
    expect(lineRoute).toContain("parts_request_work_order_line_atomic");
  });

  it("opens an actionable Pick / Order task and uses atomic allocation", () => {
    expect(queue).toContain("PickOrderTaskModal");
    expect(queue).toContain("parts-pick-order-seen:");
    expect(queue).toContain("Open Pick / Order task");
    expect(pickTaskRoute).toContain(
      'allowRoles: ["owner", "admin", "manager", "parts"]',
    );
    expect(pickTaskRoute).toContain('.from("v_part_stock")');
    expect(pickModal).toContain("Pick all available");
    expect(pickModal).toContain("Order shortage");
    expect(pickModal).toContain("Attach inventory");
    expect(pickModal).toContain("/allocate");
    expect(pickModal).toContain("Idempotency-Key");
    expect(pickModal).toContain("Dismiss duplicate");
    expect(pickModal).toContain("/cancel");
  });

  it("keeps the action footer visible while only the item list scrolls", () => {
    expect(pickModal).toContain("max-h-[calc(100dvh-2rem)]");
    expect(pickModal).toContain("min-h-0 flex-1");
    expect(pickModal).toContain("shrink-0 flex-wrap");
    expect(pickModal).not.toContain("max-h-[62vh]");
  });

  it("can cancel an untouched duplicate before work-order-part materialization", () => {
    expect(dismissMigration).toContain(
      "function public.parts_cancel_request_item",
    );
    expect(dismissMigration).toContain("if found then");
    expect(dismissMigration).toContain("set status = 'cancelled'");
    expect(dismissMigration).toContain(
      "set_config('app.parts_lifecycle_reconciling', '1', true)",
    );
  });

  it("keeps approved fulfillment out of Receiving until a PO quantity exists", () => {
    expect(receiving).toContain('.not("po_id", "is", null)');
    expect(receiving).toContain('.gt("qty_ordered", 0)');
    expect(receiving).toContain("ordered - received");
    expect(receiving).toContain("x.po_id !== null");
    expect(receiving).toContain("it.qty_received} / {it.qty_ordered} ordered");
  });

  it("keeps the repair line waiting on Parts and sends Parts Ready only to assigned technicians", () => {
    expect(migration).toContain("function public.normalize_work_order_line_status");
    expect(migration).toContain("'waiting_parts'::text");
    expect(migration).toContain(
      "function public.parts_sync_work_order_line_fulfillment_status",
    );
    expect(migration).toContain("set status = 'waiting_parts'");
    expect(migration).toContain("set status = 'active'");
    expect(migration).toContain(
      "v_stage := public.parts_request_operational_stage(p_request_id)",
    );
    expect(migration).toContain("if v_stage <> 'ready_for_tech' then");
    expect(migration).toContain("parts_tech_workflow");
    expect(migration).toContain("parts_ready_for_technician");
    expect(migration).toContain("wol.assigned_tech_id");
    expect(migration).toContain("work_order_line_technicians");
    expect(notifications).toContain('"parts_tech_workflow"');
  });
});
