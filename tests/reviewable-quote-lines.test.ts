import { describe, expect, it } from "vitest";
import { isReviewableQuoteLine, REVIEWABLE_QUOTE_STAGES } from "@/features/work-orders/lib/quotes/reviewableQuoteLines";

const base = { status: "pending_parts", stage: "advisor_pending", approved_at: null, declined_at: null, work_order_line_id: null };

describe("reviewable canonical quote lines", () => {
  it("includes pending advisor/customer review quote stages", () => {
    expect(REVIEWABLE_QUOTE_STAGES).toEqual(["advisor_pending", "ready_to_send", "sent", "customer_review"]);
    expect(isReviewableQuoteLine(base)).toBe(true);
    expect(isReviewableQuoteLine({ ...base, status: "quoted", stage: "ready_to_send" })).toBe(true);
    expect(isReviewableQuoteLine({ ...base, status: "sent", stage: "customer_review" })).toBe(true);
  });

  it("excludes terminal or materialized quote lines", () => {
    expect(isReviewableQuoteLine({ ...base, status: "declined", declined_at: "2026-01-01" })).toBe(false);
    expect(isReviewableQuoteLine({ ...base, status: "approved", approved_at: "2026-01-01" })).toBe(false);
    expect(isReviewableQuoteLine({ ...base, status: "converted", work_order_line_id: "line-1" })).toBe(false);
    expect(isReviewableQuoteLine({ ...base, status: "cancelled" })).toBe(false);
    expect(isReviewableQuoteLine({ ...base, stage: "superseded" })).toBe(false);
  });
});
