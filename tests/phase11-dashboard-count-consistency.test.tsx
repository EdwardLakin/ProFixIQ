import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import MobileAdvisorHome from "@/features/mobile/dashboard/MobileAdvisorHome";
import {
  ACTIVE_WORK_ORDER_STATUSES,
  countActiveWorkOrders,
  isActiveWorkOrderStatus,
} from "@/features/work-orders/lib/work-order-status";
import {
  createOperationsEventDeduper,
  OPERATIONS_REALTIME_TABLES,
  operationsRealtimeMutationKey,
} from "@/features/work-orders/lib/operations-invalidation";

const read = (path: string) => readFileSync(path, "utf8");

describe("phase 11 dashboard count consistency", () => {
  it("uses one active work-order lifecycle for create, close, and legacy rows", () => {
    const rows = [
      { id: "new", status: "new" },
      { id: "approval", status: "awaiting_approval" },
      { id: "parts", status: "waiting_parts" },
      { id: "legacy", status: "queued" },
      { id: "legacy-active", status: "active" },
      { id: "legacy-ready", status: "ready" },
      { id: "ready", status: "ready_to_invoice" },
      { id: "closed", status: "completed" },
      { id: "invoice", status: "invoiced" },
      { id: "cancelled", status: "cancelled" },
      { id: "new", status: "new" },
    ];

    expect(countActiveWorkOrders(rows)).toBe(7);
    expect(isActiveWorkOrderStatus("in progress")).toBe(true);
    expect(isActiveWorkOrderStatus("closed")).toBe(false);
    expect(ACTIVE_WORK_ORDER_STATUSES).not.toContain("completed");
    expect(ACTIVE_WORK_ORDER_STATUSES).not.toContain("invoiced");
  });

  it("deduplicates repeated realtime delivery without suppressing a later update", () => {
    const deduper = createOperationsEventDeduper();
    const created = operationsRealtimeMutationKey("work_orders", {
      eventType: "INSERT",
      new: { id: "wo-1", status: "new", updated_at: "2026-08-23T10:00:00Z" },
    });
    const updated = operationsRealtimeMutationKey("work_orders", {
      eventType: "UPDATE",
      new: {
        id: "wo-1",
        status: "completed",
        updated_at: "2026-08-23T11:00:00Z",
      },
    });

    expect(deduper.accept(created)).toBe(true);
    expect(deduper.accept(created)).toBe(false);
    expect(deduper.accept(updated)).toBe(true);

    const deleted = operationsRealtimeMutationKey("work_orders", {
      eventType: "DELETE",
      new: {},
      old: { id: "wo-2", status: "completed" },
    });
    expect(deleted).toContain("wo-2");
    expect(deduper.accept(deleted)).toBe(true);
  });

  it("keeps advisor active-work and waiter counts independent", () => {
    render(
      <MobileAdvisorHome
        advisorName="Alex Advisor"
        role="advisor"
        stats={{
          awaitingApprovals: 2,
          activeWos: 7,
          waiters: 1,
          appointmentsToday: 3,
        }}
      />,
    );

    expect(
      screen.getByText("Active work orders").parentElement,
    ).toHaveTextContent("7");
    expect(
      screen.getByText("Customers waiting").parentElement,
    ).toHaveTextContent("1");
  });

  it("reuses the shared status query across desktop, mobile overview, and mobile list", () => {
    const desktop = read("app/dashboard/_components/CuratedDashboardPage.tsx");
    const operations = read(
      "features/dashboard/server/getOperationsDashboardPayload.ts",
    );
    const mobileHome = read(
      "features/mobile/dashboard/server/getMobileHomePayload.ts",
    );
    const mobileList = read(
      "features/mobile/work-orders/MobileWorkOrderQueue.tsx",
    );

    for (const source of [desktop, operations, mobileHome, mobileList]) {
      expect(source).toContain("ACTIVE_WORK_ORDER_STATUSES");
    }
    expect(mobileHome).toContain('.eq("is_waiter", true)');
    expect(mobileHome).toContain("activeWos");
    expect(mobileList).toContain('{ count: "exact" }');
    expect(mobileList).toContain("totalCount");
  });

  it("refreshes all count dependencies and leaves authenticated APIs out of the PWA cache", () => {
    expect(OPERATIONS_REALTIME_TABLES).toEqual([
      "work_orders",
      "work_order_lines",
      "part_requests",
      "part_request_items",
      "work_order_quote_lines",
    ]);

    const hook = read("features/work-orders/hooks/useOperationsLiveRefresh.ts");
    expect(hook).toContain("filter: `shop_id=eq.${shopId}`");
    expect(hook).toContain('status === "CHANNEL_ERROR"');
    expect(hook).toContain('window.addEventListener("online"');

    const serviceWorker = read("app/sw.ts");
    expect(serviceWorker).toMatch(
      /url\.pathname\.startsWith\("\/api\/"\)[\s\S]{0,100}handler: new NetworkOnly\(\)/,
    );

    const route = read("app/api/mobile/home-payload/route.ts");
    expect(route).toContain('"Cache-Control": "private, no-store"');
  });
});
