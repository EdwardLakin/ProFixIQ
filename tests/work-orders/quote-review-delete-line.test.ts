import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const quoteReview = readFileSync(
  "features/work-orders/quote-review/QuoteReviewView.tsx",
  "utf8",
);
const deleteRoute = readFileSync(
  "app/api/work-orders/quotes/[id]/delete/route.ts",
  "utf8",
);
const migration = readFileSync(
  "supabase/migrations/20260918023310_quote_review_delete_draft_line.sql",
  "utf8",
);

describe("quote review delete line", () => {
  it("exposes a guarded delete action for unsent quote lines", () => {
    expect(quoteReview).toContain("canDeleteQuoteLine");
    expect(quoteReview).toContain("!isSentForDecision(line)");
    expect(quoteReview).toContain("Deleting…");
    expect(quoteReview).toContain("/delete");
    expect(quoteReview).toContain("window.confirm");
  });

  it("requires quote authorization at the API boundary", () => {
    expect(deleteRoute).toContain("actor.canAuthorizeQuotes");
    expect(deleteRoute).toContain('"delete_work_order_quote_line_draft"');
    expect(deleteRoute).toContain("export async function DELETE");
  });

  it("blocks deletion after customer, final-decision, supplier, or operational parts history", () => {
    expect(migration).toContain("sent_to_customer_at is not null");
    expect(migration).toContain("approved_at is not null");
    expect(migration).toContain("declined_at is not null");
    expect(migration).toContain("deferred_at is not null");
    expect(migration).toContain("work_order_line_id is not null");
    expect(migration).toContain("parts_supplier_quote_requests");
    expect(migration).toContain("qty_ordered");
    expect(migration).toContain("qty_received");
    expect(migration).toContain("po_id is not null");
  });

  it("cleans up only pre-approval parts rows before deleting the draft quote line", () => {
    expect(migration).toContain("delete from public.part_request_items");
    expect(migration).toContain("set status = 'cancelled'");
    expect(migration).toContain("quote_line_id = null");
    expect(migration).toContain("delete from public.work_order_quote_lines");
  });
});
