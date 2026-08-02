import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

const SHARED_CHECKOUT =
  "features/stripe/lib/server/connected-account-checkout.ts";
const STAFF_CHECKOUT = "app/api/stripe/payments/checkout/route.ts";
const PORTAL_CHECKOUT = "app/api/portal/payments/checkout/route.ts";
const CONNECT_ONBOARDING = "app/api/stripe/connect/onboard/route.ts";
const CONNECT_WEBHOOK = "app/api/stripe/connect/webhook/route.ts";

describe("Stripe Connect direct-charge architecture", () => {
  it("creates invoice Checkout Sessions in the connected shop account", async () => {
    const source = await readFile(SHARED_CHECKOUT, "utf8");

    expect(source).toContain("stripeAccount: accountId");
    expect(source).toContain('stripe_connect_charge_model ?? ""');
    expect(source).toContain('!== "direct"');
    expect(source).not.toContain("transfer_data");
    expect(source).not.toContain("payment_method_types");
  });

  it("uses one shared invoice checkout implementation for staff and portals", async () => {
    for (const path of [STAFF_CHECKOUT, PORTAL_CHECKOUT]) {
      const source = await readFile(path, "utf8");
      expect(source).toContain("createConnectedAccountInvoiceCheckout");
      expect(source).not.toContain("transfer_data");
      expect(source).not.toContain("PLATFORM_FEE_BPS");
    }
  });

  it("configures shops as direct-charge merchants with Stripe-owned fees and losses", async () => {
    const source = await readFile(CONNECT_ONBOARDING, "utf8");

    expect(source).toContain('fees: { payer: "account" }');
    expect(source).toContain('losses: { payments: "stripe" }');
    expect(source).toContain('requirement_collection: "stripe"');
    expect(source).toContain('stripe_dashboard: { type: "full" }');
    expect(source).toContain('stripe_connect_charge_model: "direct"');
    expect(source).not.toContain('type: "express"');
  });

  it("verifies connected-account events with a separate signing secret", async () => {
    const source = await readFile(CONNECT_WEBHOOK, "utf8");

    expect(source).toContain('mustEnv("STRIPE_CONNECT_WEBHOOK_SECRET")');
    expect(source).toContain("constructEvent(");
    expect(source).toContain("connectedAccountId.startsWith(\"acct_\")");
    expect(source).toContain("handleStripeWebhook(delegatedRequest)");
    expect(source).not.toContain("process.env.STRIPE_WEBHOOK_SECRET =");
  });
});
