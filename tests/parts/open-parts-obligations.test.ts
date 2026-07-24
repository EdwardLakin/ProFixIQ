import { describe, expect, it } from "vitest";
import {
  countOpenPartsObligationsByWorkOrder,
  isOpenPartsObligation,
  isPartRequestItemAwaitingReceiving,
  reconcileBoardPartsState,
} from "@/features/parts/lib/open-parts-obligations";
import type { WorkOrderBoardRow } from "@/features/shared/lib/workboard/types";

describe("canonical open parts obligations", () => {
  it("matches the receiving inbox contract instead of counting un-ordered approvals", () => {
    expect(
      isPartRequestItemAwaitingReceiving({
        request_id: "request-1",
        status: "approved",
        po_id: null,
        qty_ordered: 0,
        qty_received: 0,
      }),
    ).toBe(false);
    expect(
      isPartRequestItemAwaitingReceiving({
        request_id: "request-1",
        status: "ordered",
        po_id: "po-1",
        qty_ordered: 2,
        qty_received: 1,
      }),
    ).toBe(true);
    expect(
      isPartRequestItemAwaitingReceiving({
        request_id: "request-1",
        status: "ordered",
        po_id: "po-1",
        qty_ordered: 2,
        qty_received: 2,
      }),
    ).toBe(false);
  });

  it("stops treating handed-off and cancelled items as waiting parts", () => {
    expect(
      isOpenPartsObligation("approved", {
        request_id: "request-1",
        status: "consumed",
        qty_approved: 2,
        qty_consumed: 2,
        qty_returned: 0,
      }),
    ).toBe(false);
    expect(
      isOpenPartsObligation("cancelled", {
        request_id: "request-2",
        status: "requested",
        qty_requested: 1,
      }),
    ).toBe(false);
    expect(
      isOpenPartsObligation("approved", {
        request_id: "request-3",
        status: "received",
        qty_approved: 1,
        qty_received: 1,
        qty_consumed: 0,
      }),
    ).toBe(true);
  });

  it("counts only canonical open obligations by work order", () => {
    const counts = countOpenPartsObligationsByWorkOrder(
      [
        { id: "request-open", work_order_id: "wo-1", status: "approved" },
        { id: "request-done", work_order_id: "wo-2", status: "fulfilled" },
      ],
      [
        {
          request_id: "request-open",
          status: "ordered",
          qty_approved: 1,
          qty_ordered: 1,
        },
        {
          request_id: "request-done",
          status: "consumed",
          qty_approved: 1,
          qty_consumed: 1,
        },
      ],
    );

    expect(counts.get("wo-1")).toBe(1);
    expect(counts.has("wo-2")).toBe(false);
  });

  it("repairs a stale waiting-parts board row after handoff", () => {
    const row: WorkOrderBoardRow = {
      work_order_id: "wo-handed-off",
      custom_id: "EL000005",
      display_name: "Test customer",
      unit_label: null,
      vehicle_label: null,
      jobs_total: 1,
      jobs_completed: 0,
      progress_pct: 0,
      overall_stage: "waiting_parts",
      risk_level: "none",
      has_waiting_parts: true,
      parts_blocker_count: 1,
      jobs_waiting_parts: 1,
    };

    expect(reconcileBoardPartsState([row], new Map(), new Set())).toEqual([
      expect.objectContaining({
        overall_stage: "awaiting",
        has_waiting_parts: false,
        parts_blocker_count: 0,
        jobs_waiting_parts: 0,
      }),
    ]);
  });
});
