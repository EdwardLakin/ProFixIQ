import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  customerRequestStatusLabel,
  hiddenPartRequestIds,
} from "../features/parts/lib/requests/customer-requests";
import {
  formatPartsQuoteMoney,
  partsQuoteCanPay,
  partsQuoteNeedsDecision,
  partsQuoteStatusLabel,
  partsQuoteTotalCents,
} from "../features/portal/lib/partsQuotePresentation";
import { toPortalPartsQuote } from "../features/portal/server/portalPartsQuotes";

const source = (path: string) => readFileSync(path, "utf8");

describe("portal parts quote wiring", () => {
  it("sends parts-only requests to the parts quote flow instead of creating a work order", () => {
    const page = source("features/portal/app/quotes/request/QuoteRequestPageClient.tsx");
    const partsBranch = page.slice(
      page.indexOf('if (requestKind === "parts_only")'),
      page.indexOf('"/api/portal/request/add-quote-only"'),
    );
    expect(partsBranch).toContain('"/api/portal/parts-quotes"');
    expect(partsBranch).toContain("/portal/parts-quotes/");
    expect(partsBranch).not.toContain("add-quote-only");
    // Repair quotes keep the existing path.
    expect(page).toContain('"/api/portal/request/add-quote-only"');
  });

  it("runs the pricing and send worker every minute", () => {
    const vercel = JSON.parse(source("vercel.json")) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    expect(vercel.crons).toContainEqual({
      path: "/api/internal/portal-parts-quotes/tick",
      schedule: "* * * * *",
    });
    const route = source("app/api/internal/portal-parts-quotes/tick/route.ts");
    expect(route).toContain("CRON_SECRET");
    expect(route).toContain("requireInternalApiSecret");
  });

  it("records parts quote payments before the invoice financial lifecycle in the webhook", () => {
    const webhook = source("features/stripe/api/stripe/webhook/route.ts");
    const branch = webhook.indexOf("isPortalPartsQuoteSession(session)");
    expect(branch).toBeGreaterThan(0);
    expect(branch).toBeLessThan(webhook.indexOf("const result = await postStripeFinancialEvent({"));
    // Invoice, subscription and acquisition handling are still present.
    expect(webhook).toContain('"payment_succeeded"');
    expect(webhook).toContain("STRIPE_ACQUISITION_PURPOSE");
    expect(webhook).toContain('purpose === "profixiq_subscription"');
  });

  it("charges the shop's connected account with the invoice payment gates", () => {
    const checkout = source("features/stripe/lib/server/portal-parts-quote-checkout.ts");
    expect(checkout).toContain("stripeAccount: accountId");
    expect(checkout).toContain("stripe_connect_charge_model");
    expect(checkout).toContain("portal_payments_enabled");
    expect(checkout).toContain("application_fee_amount");
    expect(checkout).toContain("PORTAL_PARTS_QUOTE_PAYMENT_PURPOSE");
  });

  it("shows customer requests in their own queue section until approved", () => {
    const page = source("app/parts/requests/page.tsx");
    // The page itself makes no extra requests: the layout renders the section
    // and the page only reads the shared set of customer-owned part requests.
    expect(page).not.toContain("CustomerPartsQuoteRequestsPanel");
    expect(page).toContain("!customerRequestPartIds.has(model.request.id)");
    expect(source("app/parts/requests/layout.tsx")).toContain("<CustomerPartsQuoteRequestsPanel />");
    const panel = source("features/parts/components/CustomerPartsQuoteRequestsPanel.tsx");
    expect(panel).toContain("Customer requests");
    expect(source("app/api/parts/customer-requests/route.ts")).toContain("PARTS_REQUEST_QUEUE_ROLES");
  });
});

describe("customer request queue helpers", () => {
  it("hides only pre-approval requests from the regular queue", () => {
    const hidden = hiddenPartRequestIds([
      { status: "requested", partRequestId: "pr-1" },
      { status: "quoted", partRequestId: "pr-2" },
      { status: "sent", partRequestId: "pr-3" },
      { status: "approved", partRequestId: "pr-4" },
      { status: "declined", partRequestId: "pr-5" },
      { status: "requested", partRequestId: null },
    ]);
    expect([...hidden].sort()).toEqual(["pr-1", "pr-2", "pr-3"]);
  });

  it("labels staff-facing states", () => {
    expect(customerRequestStatusLabel("requested", false)).toBe("Needs pricing");
    expect(customerRequestStatusLabel("sent", false)).toBe("Sent — waiting for customer");
    expect(customerRequestStatusLabel("approved", false)).toBe("Approved — order parts");
    expect(customerRequestStatusLabel("approved", true)).toBe("Approved and paid — order parts");
  });
});

describe("customer-visible parts quote", () => {
  const row = {
    id: "q-1",
    shop_id: "shop-1",
    customer_id: "cust-1",
    vehicle_id: "veh-1",
    part_request_id: "pr-1",
    status: "quoted",
    description: "Winter tires",
    notes: null,
    qty: 4,
    currency: "cad",
    subtotal: 400,
    tax_rate: 5,
    tax_total: 20,
    total: 420,
    priced_items: [
      { id: "i-1", description: "Tire 275/65R18", part_number: "T-1", qty: 4, unit_price: 100, line_total: 400, vendor: "secret", unit_cost: 60 },
    ],
    created_at: "2026-10-04T00:00:00Z",
    sent_at: null,
    approved_at: null,
    declined_at: null,
    approval_choice: null,
    paid_at: null,
    stripe_checkout_session_id: null,
  } as unknown as Parameters<typeof toPortalPartsQuote>[0];

  it("hides pricing until the shop has sent the quote", () => {
    const hidden = toPortalPartsQuote(row, null);
    expect(hidden.total).toBeNull();
    expect(hidden.items).toEqual([]);

    const sent = toPortalPartsQuote({ ...row, status: "sent" }, null);
    expect(sent.total).toBe(420);
    expect(sent.items).toHaveLength(1);
  });

  it("never exposes cost, vendor or other staff fields", () => {
    const sent = toPortalPartsQuote({ ...row, status: "sent" }, null);
    const serialized = JSON.stringify(sent);
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("unit_cost");
    expect(serialized).not.toContain("stripe");
    expect(serialized).not.toContain("shop_id");
  });

  it("drives the decision and payment affordances from status", () => {
    expect(partsQuoteNeedsDecision("sent")).toBe(true);
    expect(partsQuoteNeedsDecision("approved")).toBe(false);
    expect(partsQuoteCanPay("approved", false, 420)).toBe(true);
    expect(partsQuoteCanPay("approved", true, 420)).toBe(false);
    expect(partsQuoteCanPay("sent", false, 420)).toBe(false);
    expect(partsQuoteStatusLabel("approved", true)).toBe("Paid");
    expect(partsQuoteTotalCents(420.01)).toBe(42001);
    expect(formatPartsQuoteMoney(null, "cad")).toBe("—");
  });
});
