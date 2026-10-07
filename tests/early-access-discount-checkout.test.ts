import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

const adapterMigration =
  "supabase/migrations/20261007152500_early_access_discount_grant_adapters.sql";

describe("Early Access discounted checkout", () => {
  it("keeps approval behind an auditable Ops operator identity", () => {
    const approve = source("app/api/ops/early-access/[id]/approve/route.ts");
    const decline = source("app/api/ops/early-access/[id]/decline/route.ts");

    expect(approve).toContain("requireOpsOperatorApiAccess");
    expect(approve).toContain("if (!access.profile?.id)");
    expect(approve).toContain("actorAuthUserId: access.user.id");
    expect(approve).toContain("actorProfileId: access.profile.id");
    expect(decline).toContain("if (!access.profile?.id)");
  });

  it("atomically approves one application and creates one task-owned grant binding", () => {
    const grants = source("features/stripe/lib/server/early-access-discount.ts");
    const migration = source(adapterMigration);

    expect(grants).toContain("issue_early_access_discount_grant_atomic");
    expect(grants).toContain('createHash("sha256")');
    expect(grants).toContain("approval_token_hash");
    expect(migration).toContain("early_access_discount_grant_bindings");
    expect(migration).toContain("application_id uuid primary key");
    expect(migration).toContain("issue_early_access_discount_grant_atomic");
    expect(migration).toContain("insert into public.billing_discount_grants");
    expect(migration).toContain("update public.early_access_applications");
    expect(migration).toContain("perform pg_advisory_xact_lock");
  });

  it("serializes link reissue and rotates a durable checkout-attempt namespace", () => {
    const grants = source("features/stripe/lib/server/early-access-discount.ts");
    const checkout = source("features/stripe/lib/server/early-access-checkout.ts");
    const migration = source(adapterMigration);
    const ops = source("features/ops/components/EarlyAccessReviewActions.tsx");

    expect(grants).toContain("checkoutAttemptNamespace");
    expect(grants).toContain("p_expected_reissue_count");
    expect(migration).toContain("p_expected_reissue_count");
    expect(migration).toContain("Early Access approval link was reissued concurrently");
    expect(migration).toContain("checkout_attempt_namespace");
    expect(checkout).toContain("input.checkoutAttemptNamespace");
    expect(checkout).toContain("requestKeyPrefix");
    expect(ops).toContain("Reissue private signup link");
  });

  it("does not attach task-specific behavior to the shared shops table", () => {
    const migration = source(adapterMigration);

    expect(migration).toContain("bind_pending_early_access_discount_grant(");
    expect(migration).not.toContain("create trigger");
    expect(migration).not.toContain("returns trigger");
    expect(migration).not.toContain("after insert or update");
  });

  it("binds deferred owner bootstrap through an explicit additive adapter", () => {
    const page = source("app/dashboard/onboarding-v2/page.tsx");
    const grants = source("features/stripe/lib/server/early-access-discount.ts");

    expect(page).toContain("bindPendingEarlyAccessGrantToShop");
    expect(page).toContain('access.canonicalRole === "owner"');
    expect(grants).toContain("bind_pending_early_access_discount_grant");
  });

  it("binds Checkout to the approved email, customer, and product package", () => {
    const grants = source("features/stripe/lib/server/early-access-discount.ts");
    const checkout = source("features/stripe/lib/server/early-access-checkout.ts");

    expect(grants).toContain("application_email");
    expect(grants).toContain("product_package");
    expect(grants).toContain("expectedEmail !== normalizeEmail(input.checkoutEmail)");
    expect(grants).toContain("expectedPackage !== input.packageKey");
    expect(grants).toContain("expectedCustomer !== input.stripeCustomerId");
    expect(checkout).toContain("ensureCustomer");
    expect(checkout).toContain("email: grant.email");
    expect(checkout).toContain("customer: customerId");
    expect(checkout).not.toContain("customer_email: grant.email");
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

  it("expires dead open sessions and routes completed expired intents through recovery", () => {
    const checkout = source("features/stripe/lib/server/early-access-checkout.ts");
    const linking = source("features/stripe/api/stripe/checkout/link-user/route.ts");
    const migration = source(adapterMigration);

    expect(checkout).toContain("checkout.sessions.expire");
    expect(checkout).toContain('existingSession.status === "complete"');
    expect(linking).toContain('claim.reason === "intent_expired"');
    expect(linking).toContain("rearmExpiredEarlyAccessAcquisitionIntent");
    expect(linking.match(/claimStripeAcquisitionIntent\(\{/g)?.length).toBe(2);
    expect(migration).toContain("rearm_expired_early_access_acquisition_intent");
    expect(migration).toContain("expires_at = now() + interval '15 minutes'");
  });

  it("reattaches grant metadata through a namespace-safe RPC", () => {
    const grants = source("features/stripe/lib/server/early-access-discount.ts");
    const checkout = source("features/stripe/lib/server/early-access-checkout.ts");
    const migration = source(adapterMigration);

    expect(grants).toContain("attach_early_access_checkout_grant");
    expect(checkout).toContain("checkoutAttemptNamespace: grant.checkoutAttemptNamespace");
    expect(migration).toContain("attach_early_access_checkout_grant");
    expect(migration).toContain("v_existing_intent_status not in ('expired', 'failed')");
  });

  it("validates Early Access identity before the canonical claim", () => {
    const linking = source("features/stripe/api/stripe/checkout/link-user/route.ts");

    expect(linking).toMatch(/earlyAccessGrantIdFromStripeMetadata\(\s*session\.metadata,?\s*\)/);
    expect(linking).toContain("validateEarlyAccessCheckoutBeforeClaim");
    expect(linking.indexOf("validateEarlyAccessCheckoutBeforeClaim")).toBeLessThan(
      linking.indexOf("claimStripeAcquisitionIntent({"),
    );
    expect(linking).toContain("deferEarlyAccessGrantShopBinding");
    expect(linking).toContain("redeemEarlyAccessGrantAfterClaim");
  });

  it("keeps the applicant on a product-bound offer page without leaking the bearer token", () => {
    const page = source("app/early-access/approved/page.tsx");
    const button = source("features/shared/components/EarlyAccessCheckoutButton.tsx");
    const cancelled = source("app/early-access/approved/cancelled/page.tsx");

    expect(page).toContain("findEarlyAccessGrantByToken");
    expect(page).toContain("Your ProFixIQ Early Access offer is ready.");
    expect(page).toContain('referrer: "no-referrer"');
    expect(page).toContain("USD/mo");
    expect(page).toContain("converted local-currency amount");
    expect(button).toContain("window.history.replaceState");
    expect(button).toContain('url.searchParams.delete("token")');
    expect(button).toContain("/api/public/early-access/checkout");
    expect(cancelled).toContain('referrer: "no-referrer"');
  });

  it("rate limits the public Stripe-creating endpoint before checkout work", () => {
    const route = source("app/api/public/early-access/checkout/route.ts");

    expect(route).toContain("enforcePublicRouteRateLimit");
    expect(route.indexOf("enforcePublicRouteRateLimit")).toBeLessThan(
      route.indexOf("request.json"),
    );
  });

  it("does not leave task-specific validation or shared-table trigger workarounds", () => {
    expect(existsSync(".github/workflows/early-access-pr2-preflight.yml")).toBe(false);
    expect(
      existsSync(
        "supabase/migrations/20261007152500_bind_pending_early_access_discount_grants.sql",
      ),
    ).toBe(false);
  });
});
