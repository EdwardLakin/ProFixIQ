import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read(
  "supabase/migrations/20260823013000_establish_quoted_parts_status_contract.sql",
);
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
    expect(statusSource).toContain(
      'if (status === "approved") return "approved"',
    );
    expect(statusSource).toContain(
      '["ordered", "partially_ordered", "reserved", "picking", "picked"]',
    );
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

  it("keeps Phase 8 quote mapping isolated from the shared Parts stage function", () => {
    expect(migration).not.toContain(
      "create or replace function public.parts_request_operational_stage",
    );
    expect(migration).toContain(
      "Do not redefine parts_request_operational_stage here",
    );
  });

  it("rejects snapshot-only parts with null customer prices or line totals", () => {
    expect(migration).toContain("snapshot.item ->> 'unit_price' is null");
    expect(migration).toContain("snapshot.item ->> 'line_total' is null");
  });

  it("reserves non-estimate pricing before delivery and recovers accepted sends", () => {
    const reserve = sendRoute.indexOf('action: "reserve"');
    const deliver = sendRoute.indexOf("await sendQuoteReadyEmail({");
    const finalize = sendRoute.indexOf('action: "finalize"');

    expect(reserve).toBeGreaterThan(0);
    expect(deliver).toBeGreaterThan(reserve);
    expect(finalize).toBeGreaterThan(deliver);
    expect(migration).toContain(
      "create or replace function public.transition_legacy_quote_send_atomic",
    );
    expect(migration).toContain("message = 'QUOTE_SEND_RESERVED'");
    expect(migration).toContain("'delivery_state', 'accepted'");
    expect(migration).toContain("perform public.assert_quote_parts_publishable(");
    expect(quoteReview).toContain('"Idempotency-Key": operationKey');
  });
});
