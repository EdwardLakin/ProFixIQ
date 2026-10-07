import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Early Access discounted checkout", () => {
  it("keeps approval behind an auditable Ops operator identity", () => {
    const approve = source("app/api/ops/early-access/[id]/approve/route.ts");
    const decline = source("app/api/ops/early-access/[id]/decline/route.ts");

    expect(approve).toContain("requireOpsOperatorApiAccess");
    expect(approve).toContain("if (!access.profile?.id)");
    expect(approve).toContain("actorAuthUserId: access.user.id");
    expect(approve).toContain("actorProfileId: access.profile.id");
    expect(decline).toContain("requireOpsOperatorApiAccess");
    expect(decline).toContain("if (!access.profile?.id)");
    expect(decline).toContain('"declined", access.profile.id');
  });

  it("creates a server-owned 30 percent repeating six-month grant with a hashed private token", () => {
    const grants = source("features/stripe/lib/server/early-access-discount.ts");

    expect(grants).toContain("EARLY_ACCESS_PERCENT_OFF = 30");
    expect(grants).toContain("EARLY_ACCESS_DURATION_MONTHS = 6");
    expect(grants).toContain("EARLY_ACCESS_TRIAL_DAYS = 7");
    expect(grants).toContain('discount_class: "beta"');
    expect(grants).toContain('duration: "repeating"');
    expect(grants).toContain('createHash("sha256")');
    expect(grants).toContain("approval_token_hash");
    expect(grants).not.toContain("approval_token:");
  });

  it("can rotate and reissue a lost private approval link without storing plaintext", () => {
    const grants = source("features/stripe/lib/server/early-access-discount.ts");
    const ops = source("features/ops/components/EarlyAccessReviewActions.tsx");
    const page = source("app/ops/early-access/page.tsx");

    expect(grants).toContain('application.status === "approved"');
    expect(grants).toContain("token_reissue_count");
    expect(grants).toContain("token_reissued_by_auth_user_id");
    expect(grants).toContain("approval_token_hash: issued.approvalTokenHash");
    expect(ops).toContain('mode?: "review" | "reissue"');
    expect(ops).toContain("Reissue private signup link");
    expect(page).toContain('mode="reissue"');
  });

  it("binds the private offer to the approved email, customer, and product package", () => {
    const grants = source("features/stripe/lib/server/early-access-discount.ts");
    const checkout = source("features/stripe/lib/server/early-access-checkout.ts");

    expect(grants).toContain("application_email");
    expect(grants).toContain("product_package");
    expect(grants).toContain("stripe_customer_id");
    expect(grants).toContain("expectedEmail !== normalizeEmail(input.checkoutEmail)");
    expect(grants).toContain("expectedPackage !== input.packageKey");
    expect(grants).toContain("expectedCustomer !== input.stripeCustomerId");
    expect(checkout).toContain("ensureCustomer");
    expect(checkout).toContain("email: grant.email");
    expect(checkout).toContain("customer: customerId");
    expect(checkout).not.toContain("customer_email: grant.email");
    expect(checkout).toContain("grant.productPackage");
  });

  it("applies the discount only through the gated Early Access checkout", () => {
    const earlyCheckout = source("features/stripe/lib/server/early-access-checkout.ts");
    const normalCheckout = source("app/api/stripe/checkout/route.ts");

    expect(earlyCheckout).toContain("discounts: [{ coupon: couponId }]");
    expect(earlyCheckout).toContain("duration_in_months: EARLY_ACCESS_DURATION_MONTHS");
    expect(earlyCheckout).toContain("applies_to: { products: [productId] }");
    expect(earlyCheckout).not.toContain("allow_promotion_codes");
    expect(normalCheckout).toContain("allow_promotion_codes: true");
    expect(normalCheckout).not.toContain("early_access_grant_id");
  });

  it("preserves the seven-day trial before the six paid discounted months", () => {
    const checkout = source("features/stripe/lib/server/early-access-checkout.ts");

    expect(checkout).toContain("trial_period_days: EARLY_ACCESS_TRIAL_DAYS");
    expect(checkout).toContain('payment_method_collection: "always"');
    expect(checkout).toContain('end_behavior: { missing_payment_method: "cancel" }');
  });

  it("uses retry-stable Stripe parameters and rotates away from expired checkout sessions", () => {
    const checkout = source("features/stripe/lib/server/early-access-checkout.ts");

    expect(checkout).toContain("requestKey = `early-access:${input.grantId}`");
    expect(checkout).toContain("profixiq:early-access-customer:${input.grantId}");
    expect(checkout).toContain("profixiq:early-access-coupon:${input.grantId}");
    expect(checkout).toContain("profixiq:early-access-checkout:${intent.id}");
    expect(checkout).toContain("integrationIdentifier(intent.id)");
    expect(checkout).toContain("after-session:${existingSession.id}");
    expect(checkout).toContain("after-intent:${intent.id}");
    expect(checkout).toContain("checkoutSessionId: existingSession.id");
    expect(checkout).toContain("stripeCustomerId: customerId");
  });

  it("validates Early Access identity before the canonical claim and defers shop binding", () => {
    const linking = source("features/stripe/api/stripe/checkout/link-user/route.ts");
    const grants = source("features/stripe/lib/server/early-access-discount.ts");
    const migration = source("supabase/migrations/20261007152500_bind_pending_early_access_discount_grants.sql");

    expect(linking).toContain("earlyAccessGrantIdFromStripeMetadata(session.metadata)");
    expect(linking).toContain("validateEarlyAccessCheckoutBeforeClaim");
    expect(linking.indexOf("validateEarlyAccessCheckoutBeforeClaim")).toBeLessThan(
      linking.indexOf("claimStripeAcquisitionIntent({"),
    );
    expect(linking).toContain("deferEarlyAccessGrantShopBinding");
    expect(linking).toContain("redeemEarlyAccessGrantAfterClaim");
    expect(grants).toContain('status: "redeemed"');
    expect(grants).toContain("shop_id: input.shopId");
    expect(migration).toContain("bind_pending_early_access_discount_grant");
    expect(migration).toContain("metadata->>'pending_user_id' = new.owner_id::text");
    expect(migration).toContain("metadata->>'subscription_id' = new.stripe_subscription_id");
  });

  it("keeps the applicant on a product-bound offer page without leaking the bearer token", () => {
    const page = source("app/early-access/approved/page.tsx");
    const button = source("features/shared/components/EarlyAccessCheckoutButton.tsx");

    expect(page).toContain("findEarlyAccessGrantByToken");
    expect(page).toContain("Your ProFixIQ Early Access offer is ready.");
    expect(page).toContain("Additional users, service trucks, fleet assets");
    expect(page).toContain('referrer: "no-referrer"');
    expect(page).toContain("USD/mo");
    expect(page).toContain("converted local-currency amount");
    expect(button).toContain("window.history.replaceState");
    expect(button).toContain('url.searchParams.delete("token")');
    expect(button).toContain("/api/public/early-access/checkout");
    expect(button).not.toContain("packageKey");
  });

  it("rate limits the public Stripe-creating endpoint before checkout work", () => {
    const route = source("app/api/public/early-access/checkout/route.ts");

    expect(route).toContain("enforcePublicRouteRateLimit");
    expect(route.indexOf("enforcePublicRouteRateLimit")).toBeLessThan(route.indexOf("request.json"));
    expect(route).toContain('route: "public-early-access-checkout"');
  });

  it("does not leave a task-specific self-mutating validation workflow in the PR", () => {
    expect(existsSync(".github/workflows/early-access-pr2-preflight.yml")).toBe(false);
  });
});
