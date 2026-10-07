import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const stripe = {
    prices: { retrieve: vi.fn() },
    coupons: { create: vi.fn() },
    customers: { create: vi.fn() },
    checkout: { sessions: { create: vi.fn(), retrieve: vi.fn(), expire: vi.fn() } },
  };
  return {
    stripe,
    findGrant: vi.fn(),
    attachGrant: vi.fn(),
    beginIntent: vi.fn(),
    attachIntent: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: () => ({}),
}));
vi.mock("@/features/stripe/lib/stripe/client", () => ({
  createStripeClient: () => mocks.stripe,
}));
vi.mock("@/features/stripe/lib/server/product-package-price-contract", () => ({
  resolveProductPackagePriceId: async () => "price_test_1",
}));
vi.mock("@/features/stripe/lib/server/stripe-acquisition-intent", () => ({
  STRIPE_ACQUISITION_PURPOSE: "acquisition",
  beginStripeAcquisitionIntent: mocks.beginIntent,
  attachStripeAcquisitionCheckout: mocks.attachIntent,
}));
vi.mock("@/features/stripe/lib/server/early-access-discount", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/stripe/lib/server/early-access-discount")>();
  return {
    ...actual,
    findEarlyAccessGrantByToken: mocks.findGrant,
    attachEarlyAccessCheckout: mocks.attachGrant,
  };
});

import { createEarlyAccessCheckout } from "@/features/stripe/lib/server/early-access-checkout";

const baseGrant = {
  grantId: "11111111-1111-4111-8111-111111111111",
  applicationId: "22222222-2222-4222-8222-222222222222",
  email: "owner@example.com",
  companyName: "Acme Garage",
  productPackage: "shop_operations",
  offerTermsVersion: "v1",
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  stripeCouponId: "coupon_1",
  stripeCustomerId: null as string | null,
  checkoutAttemptNamespace: "a".repeat(32),
};

describe("Early Access checkout creation behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = "sk_test_unit";
    mocks.stripe.customers.create.mockResolvedValue({ id: "cus_new" });
    mocks.stripe.coupons.create.mockResolvedValue({ id: "coupon_new" });
    mocks.stripe.checkout.sessions.create.mockResolvedValue({
      id: "cs_test_new",
      url: "https://checkout.stripe.test/cs_test_new",
    });
    mocks.beginIntent.mockResolvedValue({
      id: "55555555-5555-4555-8555-555555555555",
      nonce: "n".repeat(64),
      status: "pending",
      checkoutSessionId: null,
    });
    mocks.attachIntent.mockResolvedValue(undefined);
    mocks.attachGrant.mockResolvedValue(undefined);
  });

  it("creates one customer on the first attempt and attaches it to the grant", async () => {
    mocks.findGrant.mockResolvedValue({ ...baseGrant });

    const result = await createEarlyAccessCheckout("t".repeat(43));

    expect(result.sessionId).toBe("cs_test_new");
    expect(mocks.stripe.customers.create).toHaveBeenCalledTimes(1);
    expect(mocks.stripe.checkout.sessions.create.mock.calls[0][0]).toMatchObject({
      customer: "cus_new",
    });
    expect(mocks.attachGrant).toHaveBeenCalledWith(
      expect.objectContaining({ stripeCustomerId: "cus_new", checkoutSessionId: "cs_test_new" }),
    );
  });

  it("reuses the customer stored on the grant instead of creating a second one", async () => {
    mocks.findGrant.mockResolvedValue({ ...baseGrant, stripeCustomerId: "cus_stored" });

    await createEarlyAccessCheckout("t".repeat(43));

    expect(mocks.stripe.customers.create).not.toHaveBeenCalled();
    expect(mocks.stripe.checkout.sessions.create.mock.calls[0][0]).toMatchObject({
      customer: "cus_stored",
    });
    expect(mocks.attachGrant).toHaveBeenCalledWith(
      expect.objectContaining({ stripeCustomerId: "cus_stored" }),
    );
  });

  it("re-attaches an open existing session to the stored customer without a new session", async () => {
    mocks.findGrant.mockResolvedValue({ ...baseGrant, stripeCustomerId: "cus_stored" });
    mocks.beginIntent.mockResolvedValue({
      id: "55555555-5555-4555-8555-555555555555",
      nonce: "n".repeat(64),
      status: "checkout_created",
      checkoutSessionId: "cs_open_1",
    });
    mocks.stripe.checkout.sessions.retrieve.mockResolvedValue({
      id: "cs_open_1",
      status: "open",
      url: "https://checkout.stripe.test/cs_open_1",
    });

    const result = await createEarlyAccessCheckout("t".repeat(43));

    expect(result).toEqual({
      sessionId: "cs_open_1",
      url: "https://checkout.stripe.test/cs_open_1",
    });
    expect(mocks.stripe.customers.create).not.toHaveBeenCalled();
    expect(mocks.stripe.checkout.sessions.create).not.toHaveBeenCalled();
    expect(mocks.attachGrant).toHaveBeenCalledWith(
      expect.objectContaining({ stripeCustomerId: "cus_stored", checkoutSessionId: "cs_open_1" }),
    );
  });

  it("keeps Stripe parameters stable and token-free so a retry is idempotent", async () => {
    mocks.findGrant.mockResolvedValue({ ...baseGrant });

    await createEarlyAccessCheckout("t".repeat(43));
    await createEarlyAccessCheckout("t".repeat(43));

    const [first, second] = mocks.stripe.checkout.sessions.create.mock.calls;
    expect(second[0]).toEqual(first[0]);
    expect(second[1]).toEqual(first[1]);
    expect(JSON.stringify(first[0])).not.toContain("t".repeat(43));
  });
});
