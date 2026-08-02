import { afterEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";

import { claimStripeAcquisitionAfterAuth } from "../features/stripe/lib/client/claim-acquisition";

async function source(path: string): Promise<string> {
  return readFile(path, "utf8");
}

describe("P0-006 Stripe identity boundary", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not call the linking route without an exact acquisition callback", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      claimStripeAcquisitionAfterAuth(new URLSearchParams("flow=owner&session_id=cs_valid")),
    ).resolves.toEqual({ required: false, linked: true });
    await expect(
      claimStripeAcquisitionAfterAuth(new URLSearchParams("flow=acquisition&session_id=invalid")),
    ).resolves.toEqual({ required: true, linked: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits only the server-verifiable Checkout Session identifier", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true })));
    vi.stubGlobal("fetch", fetchMock);
    const sessionId = "cs_test_identity_006";

    await expect(
      claimStripeAcquisitionAfterAuth(
        new URLSearchParams(`flow=acquisition&session_id=${sessionId}`),
      ),
    ).resolves.toEqual({ required: true, linked: true });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/stripe/checkout/link-user",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ sessionId }),
      }),
    );
  });

  it("keeps price, trial, governed discounts, redirects, and Stripe retries server-owned", async () => {
    const checkout = await source("app/api/stripe/checkout/route.ts");
    const landing = await source("features/shared/components/ProFixIQLanding.tsx");
    const comparison = await source("app/compare-plans/page.tsx");
    const discountMigration = await source(
      "supabase/migrations/20260802170000_stripe_billing_model_connect_correction.sql",
    );

    expect(checkout).toContain(
      "resolveStripePlanPriceId(stripe, parsed.data.planKey)",
    );
    expect(checkout).not.toContain("STRIPE_PRICE_BASE_MONTHLY");
    expect(checkout).toContain("configuredTrialDays()");
    expect(checkout).toContain("allow_promotion_codes: true");
    expect(checkout).not.toContain("STRIPE_FOUNDING_COUPON_ID");
    expect(discountMigration).toContain(
      "create table if not exists public.billing_discount_grants",
    );
    expect(checkout).toContain("profixiq:acquisition:${intent.id}");
    expect(checkout).toContain("profixiq:shop-checkout:${shop.id}:${attemptId}");
    expect(landing).not.toContain("enableTrial:");
    expect(landing).not.toContain("applyFoundingDiscount:");
    expect(comparison).not.toContain("cancelPath:");
    expect(comparison).not.toContain("priceId:");
  });

  it("requires verified acquisition artifacts before the atomic claim", async () => {
    const linking = await source("features/stripe/api/stripe/checkout/link-user/route.ts");

    expect(linking).toContain("isCompletedStripeAcquisitionSession(session)");
    expect(linking).toContain("getStripeCheckoutPriceId(stripe, session.id)");
    expect(linking).toContain("getStripeCheckoutEmail(stripe, session)");
    expect(linking).toContain("claimStripeAcquisitionIntent({");
    expect(linking).toContain("idempotencyKey: `profixiq:acquisition-customer-link:");
    expect(linking).toContain("idempotencyKey: `profixiq:acquisition-subscription-link:");
  });

  it("reconciles canonical payment amounts before the application contract", async () => {
    const correctionPath =
      "supabase/migrations/20260725190490_p0_008_reconcile_payment_amount_contract.sql";
    const applicationPath =
      "supabase/migrations/20260725190500_p0_008_reconcile_application_schema_contract.sql";
    const correction = await source(correctionPath);

    expect(correctionPath.localeCompare(applicationPath)).toBeLessThan(0);
    expect(correction).toContain("ADD COLUMN IF NOT EXISTS amount numeric(14,2)");
    expect(correction).toContain("amount_cents::numeric / 100");
    expect(correction).toContain("ALTER COLUMN amount SET NOT NULL");
    expect(correction).toContain("cannot infer payments.amount");
  });

  it("does not expose acquisition email by bearer Checkout Session ID", async () => {
    const sessionRoute = await source("app/api/stripe/session/route.ts");
    const accessIndex = sessionRoute.indexOf("requireShopScopedApiAccess({");
    const retrieveIndex = sessionRoute.indexOf("checkout.sessions.retrieve(sessionId)");

    expect(sessionRoute).not.toContain('metadataPurpose === "profixiq_acquisition"');
    expect(accessIndex).toBeGreaterThan(-1);
    expect(retrieveIndex).toBeGreaterThan(accessIndex);
    expect(sessionRoute).not.toContain("details: message");
  });

  it("re-verifies owner authority and records anonymous acquisition by nonce", async () => {
    const webhook = await source("features/stripe/api/stripe/webhook/route.ts");

    expect(webhook).toContain("recordStripeAcquisitionCompletion({");
    expect(webhook).toContain("profile.shop_id !== shopId");
    expect(webhook).toContain('role !== "owner" && role !== "admin"');
    expect(webhook).toContain("shop.stripe_customer_id !== customerId");
    expect(webhook).not.toContain("session.metadata?.supabaseUserId");
  });
});
