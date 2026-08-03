import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const quoteReviewIndex = readFileSync("features/work-orders/app/work-orders/quote-review/page.tsx", "utf8");
const desktopClient = readFileSync("app/work-orders/[id]/Client.tsx", "utf8");
const mobileClient = readFileSync("features/work-orders/mobile/MobileWorkOrderClient.tsx", "utf8");
const findingsPage = readFileSync("features/inspections/lib/inspection/findings/page.tsx", "utf8");
const reviewWorkOrder = readFileSync("app/api/work-orders/[id]/_lib/reviewWorkOrder.ts", "utf8");
const markReady = readFileSync("app/api/work-orders/[id]/mark-ready/route.ts", "utf8");
const markReadyMigration = readFileSync(
  "supabase/migrations/20260715090100_phase8_atomic_mark_ready.sql",
  "utf8",
);
const canonicalQuotes = readFileSync("features/work-orders/lib/work-orders/canonicalQuoteLines.ts", "utf8");

describe("inspection to canonical quote review lifecycle", () => {
  it("uses canonical pending quote lines as first-class Quote Review queue sources without work_order_lines", () => {
    expect(quoteReviewIndex).toContain("isReviewableQuoteLine");
    expect(quoteReviewIndex).toContain("work_order_quote_lines(id,stage,status,approved_at,declined_at,work_order_line_id)");
    expect(quoteReviewIndex).toContain("qlines.some((line) => isReviewableQuoteLine(line))");
    expect(quoteReviewIndex).toContain('table: "work_order_quote_lines"');
  });

  it("renders pending quote cards in desktop and mobile main work-order content", () => {
    expect(desktopClient).toContain("Pending quote items");
    expect(desktopClient).toContain("partRequestsByQuoteLine[q.id]");
    expect(desktopClient).toContain("pricingReviewRequired");
    expect(desktopClient).toContain("View Parts Request");
    expect(mobileClient).toContain("Pending quote items");
    expect(mobileClient).toContain("isReviewableQuoteLine(q)");
  });

  it("does not complete the source inspection line or punch out during findings quote submission", () => {
    expect(findingsPage).toContain('/api/work-orders/quotes/add');
    expect(findingsPage).not.toContain('/api/work-orders/lines/${resolvedWorkOrderLineId}/finish');
    expect(findingsPage).not.toContain('punched_out_at');
  });

  it("blocks invoice readiness on active pending quote lines without a separate inspection-only readiness path", () => {
    expect(reviewWorkOrder).toContain('kind: "pending_quote_lines"');
    expect(reviewWorkOrder).toContain('isReviewableQuoteLine(line)');
    expect(reviewWorkOrder).not.toContain('jobType === "inspection"');
    expect(markReady).toContain('"mark_work_order_ready_atomic"');
    expect(markReadyMigration).toContain(
      "Active pending quote lines must be resolved before invoicing.",
    );
  });

  it("preserves durable source and parts request quote_line_id linkage", () => {
    expect(canonicalQuotes).toContain("source_inspection_id");
    expect(canonicalQuotes).toContain("source_work_order_line_id");
    expect(canonicalQuotes).toContain("inspection_finding_identity");
    expect(canonicalQuotes).toContain("quote_line_id: quoteLineId");
    expect(findingsPage).toContain("menu_repair_item_id");
    expect(findingsPage).toContain("pricing_review_required");
  });
});
