import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseWorkOrderBoardStageFilter } from "@/features/shared/lib/workboard/filters";
import {
  ACTIONABLE_WORK_ORDER_NOTIFICATION_FILTER,
  buildBlockers,
  isGenericWaitingWorkOrder,
  isWaitingPartsOperationalBlocker,
} from "@/features/shared/lib/workboard/utils";
import {
  CANONICAL_WORK_ORDER_OPERATIONAL_STAGES,
  normalizeWorkOrderOperationalStage,
  toCustomerSafeWorkOrderStatus,
  workOrderOperationalStageProgress,
} from "@/features/work-orders/lib/operational-stage";

const migration = readFileSync(
  "supabase/migrations/20260801220406_correct_work_order_lifecycle_review_findings.sql",
  "utf8",
);
const workOrderList = readFileSync(
  "features/work-orders/app/work-orders/view/page.tsx",
  "utf8",
);

describe("protected canonical work-order lifecycle", () => {
  it("defines exactly the protected nine-stage sequence", () => {
    expect(CANONICAL_WORK_ORDER_OPERATIONAL_STAGES).toEqual([
      "intake",
      "estimate",
      "awaiting_approval",
      "authorized",
      "waiting",
      "in_progress",
      "quality_check",
      "ready",
      "closed",
    ]);

    expect(workOrderOperationalStageProgress("intake")).toBe(0);
    expect(workOrderOperationalStageProgress("closed")).toBe(100);
  });

  it("normalizes rolling-deployment values but keeps old board links meaningful", () => {
    expect(normalizeWorkOrderOperationalStage("waiting_parts")).toBe("waiting");
    expect(normalizeWorkOrderOperationalStage("ready_to_invoice")).toBe("ready");
    expect(normalizeWorkOrderOperationalStage("completed")).toBe("ready");
    expect(parseWorkOrderBoardStageFilter("waiting_parts")).toBe("waiting");
    expect(parseWorkOrderBoardStageFilter("completed")).toBe("ready");
  });

  it("maps internal stages to a smaller customer-safe vocabulary", () => {
    expect(toCustomerSafeWorkOrderStatus("intake")).toBe("received");
    expect(toCustomerSafeWorkOrderStatus("awaiting_approval")).toBe(
      "action_needed",
    );
    expect(toCustomerSafeWorkOrderStatus("waiting")).toBe("scheduled");
    expect(toCustomerSafeWorkOrderStatus("quality_check")).toBe("in_service");
  });

  it("derives the lifecycle in security-invoker views with explicit grants", () => {
    expect(migration).toContain(
      "create or replace view public.v_work_order_board_cards_shop",
    );
    expect(migration).toContain("with (security_invoker = true)");
    expect(migration).toContain("from public.work_order_quote_lines q");
    expect(migration).toContain("from public.part_request_items pri");
    expect(migration).toContain("grant select on table");

    for (const stage of CANONICAL_WORK_ORDER_OPERATIONAL_STAGES) {
      expect(migration).toContain(`'${stage}'`);
    }

    expect(migration).not.toContain("add column operational_stage");
  });

  it("keeps completed work billable and unresolved partial decisions actionable", () => {
    expect(migration).toContain("'ready', 'ready_to_invoice', 'completed'");
    expect(migration).not.toContain(
      "'closed', 'completed', 'invoiced', 'cancelled', 'canceled'",
    );

    const awaitingDecisionBranch = migration.indexOf(
      "when coalesce(qr.any_awaiting_decision, false)",
    );
    const authorizedBranch = migration.indexOf(
      "when coalesce(lr.any_authorized, false)",
    );
    expect(awaitingDecisionBranch).toBeGreaterThan(-1);
    expect(authorizedBranch).toBeGreaterThan(awaitingDecisionBranch);
  });

  it("separates current parts blockers from terminal and generic waiting work", () => {
    expect(
      isWaitingPartsOperationalBlocker({
        overall_stage: "waiting",
        has_waiting_parts: true,
      }),
    ).toBe(true);
    expect(
      isWaitingPartsOperationalBlocker({
        overall_stage: "closed",
        has_waiting_parts: true,
      }),
    ).toBe(false);
    expect(
      isGenericWaitingWorkOrder({
        overall_stage: "waiting",
        has_waiting_parts: true,
      }),
    ).toBe(false);
    expect(
      isGenericWaitingWorkOrder({
        overall_stage: "waiting",
        has_waiting_parts: false,
      }),
    ).toBe(true);
    expect(ACTIONABLE_WORK_ORDER_NOTIFICATION_FILTER).toBe(
      "overall_stage.eq.awaiting_approval,and(overall_stage.eq.waiting,has_waiting_parts.eq.true)",
    );
    expect(
      buildBlockers(
        {
          work_order_id: "wo-closed",
          custom_id: "WO-CLOSED",
          display_name: "Customer",
          unit_label: null,
          vehicle_label: null,
          jobs_total: 1,
          jobs_completed: 1,
          progress_pct: 100,
          overall_stage: "closed",
          has_waiting_parts: true,
        },
        "shop",
      ),
    ).not.toContain("Waiting parts");
    expect(
      migration.match(
        /when stage\.overall_stage = 'waiting'\s+and coalesce\(pr\.has_waiting_parts, false\)/g,
      ),
    ).toHaveLength(3);
  });

  it("filters the waiting-parts widget before ordering and limiting", () => {
    const widget = readFileSync(
      "features/dashboard/widgets/WaitingPartsWidget.tsx",
      "utf8",
    );
    const stageFilter = widget.indexOf('.eq("overall_stage", "waiting")');
    const limit = widget.indexOf(".limit(12)");
    expect(stageFilter).toBeGreaterThan(-1);
    expect(limit).toBeGreaterThan(stageFilter);
  });

  it("does not let the work-order list mutate a projected stage directly", () => {
    expect(workOrderList).not.toContain("StatusPickerModal");
    expect(workOrderList).not.toContain(".update(");
    expect(workOrderList).toContain("v_work_order_board_cards_shop");
  });
});
