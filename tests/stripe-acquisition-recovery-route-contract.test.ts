import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const routePath = "features/stripe/api/stripe/checkout/recover-user/route.ts";

async function route(): Promise<string> {
  return readFile(routePath, "utf8");
}

describe("Stripe acquisition recovery route contract", () => {
  it("requires owner billing authority and Owner PIN", async () => {
    const source = await route();

    expect(source).toContain("requireShopScopedApiAccess({");
    expect(source).toContain('requiredCapability: "canManageBilling"');
    expect(source).toContain('allowRoles: ["owner", "admin"]');
    expect(source).toContain("requireOwnerPin: true");
    expect(source).toContain("OWNER_PIN_PURPOSES.BILLING");
    expect(source).toContain("OWNER_PIN_PURPOSES.PRIVILEGED");
  });

  it("accepts only an exact Checkout Session identifier", async () => {
    const source = await route();

    expect(source).toContain("readBoundedJson");
    expect(source).toContain("sessionId");
    expect(source).toContain("checkout.sessions.retrieve");
    expect(source).toContain('expand: ["subscription", "customer"]');
  });

  it("re-verifies the completed acquisition and access-bearing subscription", async () => {
    const source = await route();

    expect(source).toContain("readStripeAcquisitionMetadata(session.metadata)");
    expect(source).toContain("isCompletedStripeAcquisitionSession(session)");
    expect(source).toContain("getStripeCheckoutPriceId(stripe, session.id)");
    expect(source).toContain("getStripeCheckoutEmail(stripe, session)");
    expect(source).toContain("getStripeCheckoutSubscription(stripe, session)");
    expect(source).toContain(
      "isStripeSubscriptionAccessBearing(subscription.status)",
    );
    expect(source).toContain("priceId !== metadata.priceId");
  });

  it("will not replace an existing access-bearing canonical subscription", async () => {
    const source = await route();

    expect(source).toContain("verifyOldSubscriptionIsReplaceable");
    expect(source).toContain('state === "access_bearing"');
    expect(source).toContain(
      "An existing active subscription is already linked to this account",
    );
    expect(source).toContain('error.code === "resource_missing"');
  });

  it("fails closed on Stripe errors other than resource_missing", async () => {
    const source = await route();

    const helperIndex = source.indexOf(
      "async function verifyOldSubscriptionIsReplaceable",
    );
    const rpcIndex = source.indexOf(
      "recoverStrandedStripeAcquisitionIdentity({",
    );

    expect(helperIndex).toBeGreaterThan(-1);
    expect(rpcIndex).toBeGreaterThan(helperIndex);
    expect(source).toContain("Stripe.errors.StripeError");
    expect(source).toContain('error.code === "resource_missing"');
  });

  it("uses the authenticated canonical profile/shop as the CAS snapshot", async () => {
    const source = await route();

    expect(source).toContain('.eq("id", access.profile.id)');
    expect(source).toContain('.eq("id", access.profile.shop_id)');
    expect(source).toContain("authUserId: access.authUserId");
    expect(source).toContain("profileId: access.profile.id");
    expect(source).toContain("shopId: access.profile.shop_id");
    expect(source).toContain(
      "expectedProfileSubscriptionId: profile.stripe_subscription_id",
    );
    expect(source).toContain(
      "expectedShopSubscriptionId: shop.stripe_subscription_id",
    );
  });

  it("returns the Stripe-verified acquisition surface after recovery", async () => {
    const source = await route();

    expect(source).toContain("surface: metadata.surface");
  });

  it("makes post-swap Stripe writes retryable and then synchronizes canonical billing", async () => {
    const source = await route();

    const recoveryIndex = source.indexOf(
      "recoverStrandedStripeAcquisitionIdentity({",
    );
    const customerUpdateIndex = source.indexOf("stripe.customers.update(");
    const subscriptionUpdateIndex = source.indexOf(
      "stripe.subscriptions.update(",
    );
    const syncIndex = source.indexOf("syncCanonicalShopBilling({");

    expect(recoveryIndex).toBeGreaterThan(-1);
    expect(customerUpdateIndex).toBeGreaterThan(recoveryIndex);
    expect(subscriptionUpdateIndex).toBeGreaterThan(customerUpdateIndex);
    expect(syncIndex).toBeGreaterThan(subscriptionUpdateIndex);

    expect(source).toContain("profixiq:acquisition-recovery-customer:");
    expect(source).toContain("profixiq:acquisition-recovery-subscription:");
  });
});
