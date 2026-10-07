import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Early Access discounted checkout", () => {
  it("keeps approval behind the Ops operator boundary", () => {
    const approve = source("app/api/ops/early-access/[id]/approve/route.ts");
    const decline = source("app/api/ops/early-access/[id]/decline/route.ts");

    expect(approve).toContain("requireOpsOperatorApiAccess");
    expect(approve).toContain("approveEarlyAccessDiscount");
    expect(decline).toContain("requireOpsOperatorApiAccess");
    expect(decline).toContain('"declined"');
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

  it("binds the private offer to the approved email and product package", () => {
    const grants = source("features/stripe/lib/server/early-access-discount.ts");
    const checkout = source("features/stripe/lib/server/early-access-checkout.ts");

    expect(grants).toContain("application_email");
    expect(grants).toContain("product_package");
    expect(grants).toContain("expectedEmail !== normalizeEmail(input.checkoutEmail)");
    expect(grants).toContain("expectedPackage !== input.packageKey");
    expect(checkout).toContain("customer_email: grant.email");
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

  it("uses one grant-owned acquisition intent and idempotent Stripe objects to prevent replay", () => {
    const checkout = source("features/stripe/lib/server/early-access-checkout.ts");

    expect(checkout).toContain("requestKey: `early-access:${grant.grantId}`");
    expect(checkout).toContain("profixiq:early-access-coupon:${input.grantId}");
    expect(checkout).toContain("profixiq:early-access-checkout:${grant.grantId}");
    expect(checkout).toContain("intent.checkoutSessionId");
  });

  it("redeems the grant only after the Stripe acquisition is claimed to a shop", () => {
    const linking = source("features/stripe/api/stripe/checkout/link-user/route.ts");
    const grants = source("features/stripe/lib/server/early-access-discount.ts");

    expect(linking).toContain("earlyAccessGrantIdFromStripeMetadata(session.metadata)");
    expect(linking).toContain("redeemEarlyAccessGrantAfterClaim");
    expect(linking).toContain("claim.shopId");
    expect(grants).toContain('status: "redeemed"');
    expect(grants).toContain("shop_id: input.shopId");
  });

  it("keeps the applicant on a product-bound offer page with no package switcher", () => {
    const page = source("app/early-access/approved/page.tsx");
    const button = source("features/shared/components/EarlyAccessCheckoutButton.tsx");

    expect(page).toContain("findEarlyAccessGrantByToken");
    expect(page).toContain("Your ProFixIQ Early Access offer is ready.");
    expect(page).toContain("Additional users, service trucks, fleet assets");
    expect(button).toContain("/api/public/early-access/checkout");
    expect(button).not.toContain("packageKey");
  });

  it("rate limits the public Stripe-creating endpoint before checkout work", () => {
    const route = source("app/api/public/early-access/checkout/route.ts");

    expect(route).toContain("enforcePublicRouteRateLimit");
    expect(route.indexOf("enforcePublicRouteRateLimit")).toBeLessThan(route.indexOf("request.json"));
    expect(route).toContain('route: "public-early-access-checkout"');
  });
});
