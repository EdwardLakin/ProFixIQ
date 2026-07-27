import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeQuoteApprovals } from "@/features/portal/server/listPortalApprovals";

const read = (path: string) => readFileSync(path, "utf8");

describe("quote email and customer portal alignment", () => {
  it("surfaces sent canonical quote lines and excludes completed decisions", () => {
    const summaries = normalizeQuoteApprovals([
      {
        id: "quote-1",
        work_order_id: "work-order-1",
        status: "sent",
        stage: "sent",
        sent_to_customer_at: "2026-07-26T22:34:14.939Z",
        grand_total: 125,
        work_orders: {
          id: "work-order-1",
          custom_id: "EL000006",
          created_at: "2026-07-26T20:00:00.000Z",
        },
      },
      {
        id: "quote-2",
        work_order_id: "work-order-1",
        status: "converted",
        stage: "customer_approved",
        sent_to_customer_at: "2026-07-26T22:34:14.939Z",
        approved_at: "2026-07-26T23:00:00.000Z",
        grand_total: 75,
        work_orders: {
          id: "work-order-1",
          custom_id: "EL000006",
          created_at: "2026-07-26T20:00:00.000Z",
        },
      },
    ]);

    expect(summaries).toEqual([
      {
        workOrderId: "work-order-1",
        reference: "EL000006",
        createdAt: "2026-07-26T22:34:14.939Z",
        lineCount: 1,
        total: 125,
      },
    ]);
  });

  it("marks the work order pending when quote email persistence completes", () => {
    const sendRoute = read("app/api/quotes/send/route.ts");
    const newlySentQuotePersistence = sendRoute.indexOf(
      "...(sendableQuoteLineIds.length > 0",
    );
    const approvalStatePersistence = sendRoute.indexOf(
      "work_order_quote_approval_state_update",
    );
    expect(newlySentQuotePersistence).toBeGreaterThanOrEqual(0);
    expect(approvalStatePersistence).toBeGreaterThan(newlySentQuotePersistence);
    expect(sendRoute).toContain("work_order_quote_approval_state_update");
    expect(sendRoute).toContain('approval_state: "pending"');
  });

  it("derives portal-home attention from unresolved canonical quote lines", () => {
    const loader = read("features/portal/server/portalWorkOrders.ts");
    expect(loader).toContain('from("work_order_quote_lines")');
    expect(loader).toContain("pendingQuoteWorkOrderIds.has(workOrder.id)");
    expect(loader).toContain("quoteLinesByWorkOrder.get(workOrder.id)");
  });

  it("keeps deep-link login compatible with the shared identifier strategy", () => {
    const signIn = read("app/portal/auth/sign-in/PortalSignInForm.tsx");
    expect(signIn).toContain('"Email or username"');
    expect(signIn).toContain('type="text"');
  });

  it("sends the stable idempotency key required by quote decisions", () => {
    const actions = read("features/portal/components/QuoteApprovalActions.tsx");
    expect(actions).toContain('"Idempotency-Key": operationKey');
    expect(actions).toContain("operationKeys.current.get(actionIdentity)");
  });
});
