import { describe, expect, it } from "vitest";

import {
  countWorkOrdersBySummary,
  filterWorkOrdersBySummary,
  matchesWorkOrderSummaryFilter,
  normalizeWorkOrderListStatus,
  toggleWorkOrderSummaryFilter,
} from "@/features/work-orders/lib/workOrderListFilters";

const NOW = Date.parse("2026-07-30T12:00:00.000Z");
const DAY = 86_400_000;

describe("work-order summary filters", () => {
  it("preserves list-only statuses instead of folding on hold into waiting parts", () => {
    expect(normalizeWorkOrderListStatus("on hold")).toBe("on_hold");
    expect(normalizeWorkOrderListStatus("waiting parts")).toBe("waiting_parts");
    expect(normalizeWorkOrderListStatus("queued")).toBe("queued");
  });

  it.each([
    "new",
    "awaiting",
    "awaiting_inspection",
    "recommended",
    "approved",
    "queued",
    "planned",
  ])("treats %s as ready to work", (status) => {
    expect(
      matchesWorkOrderSummaryFilter({ status }, "ready_to_work", NOW),
    ).toBe(true);
  });

  it.each(["awaiting_approval", "in_progress", "on_hold", "waiting_parts"])(
    "does not treat %s as ready to work",
    (status) => {
      expect(
        matchesWorkOrderSummaryFilter({ status }, "ready_to_work", NOW),
      ).toBe(false);
    },
  );

  it("counts only the canonical waiting-parts state", () => {
    expect(
      matchesWorkOrderSummaryFilter(
        { status: "waiting_parts" },
        "waiting_parts",
        NOW,
      ),
    ).toBe(true);
    expect(
      matchesWorkOrderSummaryFilter(
        { status: "on_hold" },
        "waiting_parts",
        NOW,
      ),
    ).toBe(false);
  });

  it.each(["completed", "ready_to_invoice"])(
    "treats %s as ready to invoice",
    (status) => {
      expect(
        matchesWorkOrderSummaryFilter({ status }, "ready_to_invoice", NOW),
      ).toBe(true);
    },
  );

  it("marks urgent work as at risk regardless of age", () => {
    expect(
      matchesWorkOrderSummaryFilter(
        {
          status: "new",
          priority: 1,
          updated_at: new Date(NOW).toISOString(),
        },
        "at_risk",
        NOW,
      ),
    ).toBe(true);
  });

  it("marks work stale at three days as at risk", () => {
    expect(
      matchesWorkOrderSummaryFilter(
        {
          status: "new",
          priority: 3,
          updated_at: new Date(NOW - 3 * DAY).toISOString(),
        },
        "at_risk",
        NOW,
      ),
    ).toBe(true);
  });

  it("keeps fresh and invalidly dated work out of at risk", () => {
    expect(
      matchesWorkOrderSummaryFilter(
        {
          status: "new",
          priority: 3,
          updated_at: new Date(NOW - DAY).toISOString(),
        },
        "at_risk",
        NOW,
      ),
    ).toBe(false);
    expect(
      matchesWorkOrderSummaryFilter(
        { status: "new", priority: 3, updated_at: "not-a-date" },
        "at_risk",
        NOW,
      ),
    ).toBe(false);
  });

  it("filters and counts with the same predicate", () => {
    const rows = [
      { id: "parts", status: "waiting_parts" },
      { id: "hold", status: "on_hold" },
      { id: "ready", status: "approved" },
    ];

    expect(
      filterWorkOrdersBySummary(rows, "waiting_parts", NOW).map(
        (row) => row.id,
      ),
    ).toEqual(["parts"]);
    expect(countWorkOrdersBySummary(rows, "waiting_parts", NOW)).toBe(1);
  });

  it("returns the original list when no summary filter is selected", () => {
    const rows = [{ status: "approved" }];
    expect(filterWorkOrdersBySummary(rows, null, NOW)).toBe(rows);
  });

  it("toggles a selected card off and switches directly to another card", () => {
    expect(toggleWorkOrderSummaryFilter(null, "at_risk")).toBe("at_risk");
    expect(toggleWorkOrderSummaryFilter("at_risk", "at_risk")).toBeNull();
    expect(toggleWorkOrderSummaryFilter("at_risk", "waiting_parts")).toBe(
      "waiting_parts",
    );
  });
});
