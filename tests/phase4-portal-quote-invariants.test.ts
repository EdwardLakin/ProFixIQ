import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const quotePage = read("app/portal/quotes/page.tsx");
const quoteList = read("features/portal/server/listPortalQuotes.ts");
const approvals = read("features/portal/server/listPortalApprovals.ts");
const detailRoute = read("app/api/portal/quotes/[id]/route.ts");
const detailClient = read(
  "features/portal/app/quotes/[id]/QuotePageClient.tsx",
);
const decisionMigration = read(
  "supabase/migrations/20260822223500_reject_hidden_quote_decisions.sql",
);

describe("Phase 4 customer portal quote invariants", () => {
  it("lists visible quote lines from every owned work order", () => {
    expect(quotePage).toContain("listPortalQuotesForCustomer");
    expect(quoteList).toContain('.eq("shop_id", shopId)');
    expect(quoteList).toContain('.eq("customer_id", customerId)');
    expect(quoteList).toContain("isCustomerVisibleQuoteLine");
    expect(quoteList).toContain("isCustomerVisibleDirectWorkOrderLine");
    expect(quoteList).toContain(".range(offset, offset + PAGE_SIZE - 1)");
    expect(quoteList).not.toContain(
      'or("external_id.like.portal_quote:%,estimate_number.not.is.null")',
    );
  });

  it("rejects hidden lifecycle spellings in presentation and atomic decisions", () => {
    expect(decisionMigration).toContain(
      "apply_customer_quote_decision_engine_atomic",
    );
    for (const status of [
      "cancelled",
      "canceled",
      "voided",
      "rejected",
      "superseded",
    ]) {
      expect(decisionMigration).toContain(`'${status}'`);
    }
    expect(decisionMigration).toContain(
      "Quote line cannot be changed from its current status.",
    );
  });

  it("scopes approval queries to both customer and shop", () => {
    expect(approvals).toContain('.eq("work_orders.customer_id", customer.id)');
    expect(approvals).toContain('.eq("work_orders.shop_id", shopId)');
    expect(approvals).toContain('.eq("shop_id", shopId)');
  });

  it("resolves quote ownership on the server with non-disclosing 404s", () => {
    expect(detailRoute).toContain("requirePortalCustomerActor");
    expect(detailRoute).toContain("UUID_PATTERN.test(workOrderId)");
    expect(detailRoute).toContain('.eq("id", workOrderId)');
    expect(detailRoute).toContain('.eq("shop_id", shopId)');
    expect(detailRoute).toContain('.eq("customer_id", actor.customer.id)');
    expect(detailRoute).toContain(
      'portalError("This quote is unavailable.", 404)',
    );
    expect(detailRoute).toContain("sanitizeCustomerVisibleQuoteMetadata");
    expect(detailRoute).toContain("createAdminSupabase");
    expect(
      detailRoute.indexOf("const actor = await requirePortalCustomerActor"),
    ).toBeLessThan(
      detailRoute.indexOf("const admin = createAdminSupabase"),
    );
  });

  it("loads quote detail through the owned portal endpoint", () => {
    expect(detailClient).toContain(
      "`/api/portal/quotes/${encodeURIComponent(workOrderId)}`",
    );
    expect(detailClient).toContain("runBoundedRouteLoad");
    expect(detailClient).not.toContain("createBrowserSupabase");
    expect(detailClient).not.toContain('.from("customers")');
    expect(detailClient).not.toContain('.from("work_orders")');
  });
});
