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

  it("preserves partial estimate approval while marking a first send pending", () => {
    const sendRoute = read("app/api/quotes/send/route.ts");
    const migration = read(
      "supabase/migrations/20260802024436_advisor_estimate_workflow.sql",
    );
    const reservation = sendRoute.indexOf('"reserve_estimate_send_atomic"');
    const finalization = sendRoute.lastIndexOf(
      '"finalize_estimate_send_atomic"',
    );
    expect(reservation).toBeGreaterThanOrEqual(0);
    expect(finalization).toBeGreaterThan(reservation);
    expect(migration).toContain("when v_has_approved_lines then 'partial'");
    expect(migration).toContain("else 'pending'");
    expect(migration).toContain("update public.work_order_quote_lines q");
    expect(migration).toContain("update public.work_orders w");
    expect(sendRoute).toContain('req.headers.get("Idempotency-Key")');
    expect(sendRoute).toContain("estimateSendReplayResponse");
    expect(sendRoute).toContain("findAcceptedEstimateEmail");
    expect(sendRoute).toContain("recoverAcceptedEstimateSend");
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
