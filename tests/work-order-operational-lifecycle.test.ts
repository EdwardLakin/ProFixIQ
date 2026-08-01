import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseWorkOrderBoardStageFilter } from "@/features/shared/lib/workboard/filters";
import {
  CANONICAL_WORK_ORDER_OPERATIONAL_STAGES,
  normalizeWorkOrderOperationalStage,
  toCustomerSafeWorkOrderStatus,
  workOrderOperationalStageProgress,
} from "@/features/work-orders/lib/operational-stage";

const migration = readFileSync(
  "supabase/migrations/20260801164830_protected_canonical_work_order_lifecycle.sql",
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
    expect(normalizeWorkOrderOperationalStage("completed")).toBe("closed");
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

  it("does not let the work-order list mutate a projected stage directly", () => {
    expect(workOrderList).not.toContain("StatusPickerModal");
    expect(workOrderList).not.toContain(".update(");
    expect(workOrderList).toContain("v_work_order_board_cards_shop");
  });
});
