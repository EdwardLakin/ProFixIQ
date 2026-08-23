import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read(
  "supabase/migrations/20260823013000_establish_quoted_parts_status_contract.sql",
);
const runtime = read("tests/security/quote-review-cost-and-sell.runtime.sql");
const sendRoute = read("app/api/quotes/send/route.ts");
const workOrderClient = read("app/work-orders/[id]/Client.tsx");
const invoiceSnapshot = read("features/invoices/server/getInvoiceSnapshot.ts");
const portalQuote = read("features/portal/app/quotes/[id]/QuotePageClient.tsx");
const quoteReview = read(
  "features/work-orders/quote-review/QuoteReviewView.tsx",
);

describe("Phase 8 quoted-parts and workflow-status contract", () => {
  it("does not collapse approval into ordering", () => {
    const statusSource = read("features/parts/lib/status-display.ts");
    expect(statusSource).toContain('if (status === "approved") return "approved"');
    expect(statusSource).not.toContain('status === "approved" || status === "reserved"');
    expect(migration).toContain(
      "if v_any_order_progress then\n    return 'order_receive';",
    );
    expect(migration).toContain(
      "if lower(v_request.status::text) in ('requested', 'quoted') then\n    return 'awaiting_approval';",
    );
    expect(runtime).toContain("set status = 'ordered'");
    expect(runtime).not.toContain("set status = 'ordered', qty_ordered = qty");
  });

  it("derives work-order parts labels from the canonical quote snapshot", () => {
    expect(workOrderClient).toContain("resolveQuotePartsRequirement");
    expect(workOrderClient).toContain('partsRequirement.state === "labor_only"');
    expect(workOrderClient).toContain('"Not recorded"');
    expect(workOrderClient).not.toContain('"Not required / not created"');
  });

  it("shares the greatest-quantity rule with quote review, Portal, and invoice", () => {
    expect(invoiceSnapshot).toContain("canonicalQuotePartQuantity(item)");
    expect(portalQuote).toContain("canonicalQuotePartQuantity(part)");
    expect(quoteReview).toContain("canonicalQuotePartQuantity(p)");
    expect(quoteReview).toContain("readCanonicalQuotePartsSnapshot(line.metadata)");
    expect(read("features/work-orders/quote-review/partsModel.ts")).toContain(
      "canonicalQuotePartQuantity(item)",
    );
  });

  it("blocks publishing on incomplete or mismatched parts without leaking SQL", () => {
    expect(sendRoute).toContain('"assert_quote_parts_publishable"');
    expect(sendRoute).toContain('code: contractCode');
    expect(sendRoute).not.toContain("partsContractError.details");
    expect(migration).toContain("message = 'QUOTE_PARTS_INCOMPLETE'");
    expect(migration).toContain("message = 'QUOTE_PARTS_CONTRACT_MISMATCH'");
    expect(migration).toContain(
      "grant execute on function public.assert_quote_parts_publishable(uuid, uuid, uuid[])\n  to service_role",
    );
    expect(migration).toContain(
      "revoke all on function public.assert_quote_parts_publishable(uuid, uuid, uuid[])\n  from public, anon, authenticated",
    );
  });

  it("aligns the database workbench stage with manual/vendor quote readiness", () => {
    expect(migration).toContain(
      "create or replace function public.parts_request_operational_stage",
    );
    expect(migration).toContain("public.part_request_item_is_quote_ready(");
    expect(migration).not.toContain(
      "nullif(trim(pri.description), '') is not null\n+      and pri.part_id is not null",
    );
  });
});
