import { describe, expect, it } from "vitest";
import {
  isCustomerVisibleDirectWorkOrderLine,
  isCustomerVisibleQuoteLine,
  isPendingCustomerQuoteLine,
} from "./quoteApprovalPresentation";

describe("customer portal quote visibility", () => {
  it("uses one lifecycle contract for visible and pending quote lines", () => {
    const sent = {
      status: "sent",
      stage: "customer_review",
      sent_to_customer_at: "2026-08-22T12:00:00.000Z",
      approved_at: null,
      declined_at: null,
      work_order_line_id: null,
    };

    expect(isCustomerVisibleQuoteLine(sent)).toBe(true);
    expect(isPendingCustomerQuoteLine(sent)).toBe(true);
    expect(
      isPendingCustomerQuoteLine({
        ...sent,
        status: "approved",
        approved_at: "2026-08-22T12:05:00.000Z",
      }),
    ).toBe(false);
  });

  it("never exposes cancelled, rejected, or superseded revisions", () => {
    for (const status of ["cancelled", "rejected", "superseded"]) {
      const row = {
        status,
        stage: "customer_review",
        sent_to_customer_at: "2026-08-22T12:00:00.000Z",
      };
      expect(isCustomerVisibleQuoteLine(row)).toBe(false);
      expect(isPendingCustomerQuoteLine(row)).toBe(false);
    }
  });

  it("only exposes direct work-order lines in customer decision/history states", () => {
    expect(
      isCustomerVisibleDirectWorkOrderLine({
        status: "awaiting_approval",
        line_status: "quoted",
        approval_state: "pending",
        voided_at: null,
      }),
    ).toBe(true);
    expect(
      isCustomerVisibleDirectWorkOrderLine({
        status: "awaiting",
        line_status: "draft",
        approval_state: null,
        voided_at: null,
      }),
    ).toBe(false);
    expect(
      isCustomerVisibleDirectWorkOrderLine({
        status: "completed",
        line_status: "authorized",
        approval_state: "approved",
        voided_at: "2026-08-22T12:10:00.000Z",
      }),
    ).toBe(false);
  });
});
