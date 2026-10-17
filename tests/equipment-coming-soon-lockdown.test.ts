import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createStripeClient: vi.fn(),
  sessionsCreate: vi.fn(),
  resolvePackagePrice: vi.fn(),
  resolveAddonPrice: vi.fn(),
  resolveLegacyPrice: vi.fn(),
  beginIntent: vi.fn(),
  attachCheckout: vi.fn(),
  findGrant: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/stripe/lib/stripe/client", () => ({
  createStripeClient: mocks.createStripeClient,
}));
vi.mock("@/features/stripe/lib/server/product-package-price-contract", () => ({
  resolveProductPackagePriceId: mocks.resolvePackagePrice,
}));
vi.mock("@/features/stripe/lib/server/equipment-addon-price-contract", () => ({
  resolveEquipmentAddonPriceId: mocks.resolveAddonPrice,
}));
vi.mock("@/features/stripe/lib/server/stripe-price-contract", () => ({
  resolveStripePlanPriceId: mocks.resolveLegacyPrice,
}));
vi.mock("@/features/stripe/lib/server/stripe-acquisition-intent", () => ({
  STRIPE_ACQUISITION_PURPOSE: "profixiq_acquisition",
  beginStripeAcquisitionIntent: mocks.beginIntent,
  attachStripeAcquisitionCheckout: mocks.attachCheckout,
}));
vi.mock("@/features/stripe/lib/server/early-access-discount", () => ({
  EARLY_ACCESS_DURATION_MONTHS: 6,
  EARLY_ACCESS_PERCENT_OFF: 30,
  EARLY_ACCESS_TRIAL_DAYS: 14,
  attachEarlyAccessCheckout: vi.fn(),
  findEarlyAccessGrantByToken: mocks.findGrant,
}));
vi.mock("@/features/analytics/server/checkout-started", () => ({
  recordMarketingCheckoutStarted: vi.fn(),
}));
vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: vi.fn(),
}));
vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: () => ({}),
}));
vi.mock("@/features/stripe/lib/server/trial-config", () => ({
  configuredTrialDays: () => 14,
}));

import { POST } from "../app/api/stripe/checkout/route";
import { createEarlyAccessCheckout } from "@/features/stripe/lib/server/early-access-checkout";
import {
  EQUIPMENT_COMING_SOON_CODE,
  isBlockedEquipmentCheckoutRequest,
} from "@/features/stripe/lib/server/package-checkout-availability";

const ATTEMPT = "11111111-1111-4111-8111-111111111111";

function post(body: unknown) {
  return new Request("http://localhost/api/stripe/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.createStripeClient.mockReturnValue({
    checkout: { sessions: { create: mocks.sessionsCreate } },
  });
  mocks.sessionsCreate.mockResolvedValue({
    id: "cs_test_1",
    url: "https://checkout.stripe.test/cs_test_1",
  });
  mocks.resolvePackagePrice.mockResolvedValue("price_pkg");
  mocks.resolveLegacyPrice.mockResolvedValue("price_legacy");
  mocks.resolveAddonPrice.mockResolvedValue("price_addon");
  mocks.beginIntent.mockResolvedValue({
    id: "intent_1",
    nonce: "nonce",
    status: "pending",
    checkoutSessionId: null,
  });
});

describe("Equipment Coming soon: checkout route", () => {
  const equipmentRequests: Array<[string, Record<string, unknown>]> = [
    ["standalone package", { packageKey: "equipment_operations", flow: "acquisition" }],
    ["standalone package via pricing CTA", { packageKey: "equipment_operations", source: "pricing_cta" }],
    ["standalone package via owner flow", { packageKey: "equipment_operations", flow: "owner" }],
    ["Complete + Equipment trial", { packageKey: "complete_operations", equipmentAddon: true, source: "pricing_cta", checkoutMode: "trial" }],
    ["Complete + Equipment paid", { packageKey: "complete_operations", equipmentAddon: true, flow: "acquisition", checkoutMode: "paid" }],
    ["add-on on a non-Complete package", { packageKey: "shop_operations", equipmentAddon: true, flow: "acquisition" }],
    ["add-on on owner flow", { packageKey: "complete_operations", equipmentAddon: true, flow: "owner" }],
    ["add-on with legacy plan key", { planKey: "starter", equipmentAddon: true, flow: "acquisition" }],
    ["equipment alias in planKey", { planKey: "equipment", flow: "acquisition" }],
    ["truthy non-boolean add-on", { packageKey: "complete_operations", equipmentAddon: "true", flow: "acquisition" }],
    ["add-on with hand-picked price id", { packageKey: "complete_operations", equipmentAddon: true, priceId: "price_x", flow: "acquisition" }],
  ];

  it.each(equipmentRequests)("answers Coming soon without touching Stripe: %s", async (_name, body) => {
    const response = await POST(post({ checkoutAttemptId: ATTEMPT, ...body }));

    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.code).toBe(EQUIPMENT_COMING_SOON_CODE);
    expect(json.error).toMatch(/coming soon/i);
    expect(mocks.createStripeClient).not.toHaveBeenCalled();
    expect(mocks.beginIntent).not.toHaveBeenCalled();
    expect(mocks.sessionsCreate).not.toHaveBeenCalled();
    expect(mocks.resolveAddonPrice).not.toHaveBeenCalled();
  });

  it("does not reopen on an unrelated or near-miss environment value", async () => {
    vi.stubEnv("PROFIXIQ_EQUIPMENT_CHECKOUT_ENABLED", "1");
    const response = await POST(
      post({ packageKey: "complete_operations", equipmentAddon: true, flow: "acquisition" }),
    );
    expect(response.status).toBe(403);
    expect(mocks.sessionsCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["shop_operations"],
    ["field_service"],
    ["fleet_maintenance"],
    ["complete_operations"],
  ])("leaves %s acquisition checkout unchanged", async (packageKey) => {
    const response = await POST(
      post({ packageKey, flow: "acquisition", checkoutAttemptId: ATTEMPT }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, sessionId: "cs_test_1" });
    expect(mocks.sessionsCreate).toHaveBeenCalledTimes(1);
    const params = mocks.sessionsCreate.mock.calls[0][0];
    expect(params.line_items).toEqual([{ price: "price_pkg", quantity: 1 }]);
    expect(params.metadata.package_key).toBe(packageKey);
    expect(params.metadata.equipment_addon).toBeUndefined();
    expect(mocks.resolveAddonPrice).not.toHaveBeenCalled();
  });

  it("leaves legacy plan checkout unchanged", async () => {
    const response = await POST(
      post({ planKey: "starter", flow: "acquisition", checkoutAttemptId: ATTEMPT }),
    );
    expect(response.status).toBe(200);
    expect(mocks.sessionsCreate.mock.calls[0][0].line_items).toEqual([
      { price: "price_legacy", quantity: 1 },
    ]);
  });

  it("opens the same paths only when the existing launch flag is explicitly true", async () => {
    vi.stubEnv("PROFIXIQ_EQUIPMENT_CHECKOUT_ENABLED", "true");
    expect(
      isBlockedEquipmentCheckoutRequest({ packageKey: "equipment_operations" }),
    ).toBe(false);
    expect(
      isBlockedEquipmentCheckoutRequest({ packageKey: "complete_operations", equipmentAddon: true }),
    ).toBe(false);
  });
});

describe("Equipment Coming soon: Early Access checkout", () => {
  const grant = (productPackage: string) => ({
    grantId: "g1",
    applicationId: "a1",
    email: "a@b.test",
    companyName: "Co",
    productPackage,
    offerTermsVersion: "v1",
    expiresAt: "2999-01-01T00:00:00Z",
    stripeCouponId: null,
    stripeCustomerId: null,
    checkoutAttemptNamespace: "n".repeat(32),
  });

  it("refuses an Equipment grant before any Stripe or ledger call", async () => {
    mocks.findGrant.mockResolvedValue(grant("equipment_operations"));

    await expect(createEarlyAccessCheckout("t".repeat(43))).rejects.toThrow(/coming soon/i);
    expect(mocks.createStripeClient).not.toHaveBeenCalled();
    expect(mocks.resolvePackagePrice).not.toHaveBeenCalled();
    expect(mocks.beginIntent).not.toHaveBeenCalled();
    expect(mocks.sessionsCreate).not.toHaveBeenCalled();
  });

  it("still proceeds to Stripe for a non-Equipment grant", async () => {
    mocks.findGrant.mockResolvedValue(grant("shop_operations"));
    mocks.createStripeClient.mockImplementation(() => {
      throw new Error("reached-stripe");
    });

    await expect(createEarlyAccessCheckout("t".repeat(43))).rejects.toThrow("reached-stripe");
  });
});

describe("Equipment Coming soon: public surfaces", () => {
  const read = (path: string) => readFileSync(path, "utf8");

  it("disables every Equipment trial/subscribe button and short-circuits the handler", () => {
    const pricing = read("features/shared/components/ui/PricingSection.tsx");
    expect(pricing).toContain("if (equipmentAddon) return;");
    const equipmentButtons = pricing.match(
      /<button[^>]*?onClick=\{\(\) => void startCheckout\("complete_operations", "(?:trial|paid)", true\)\}[\s\S]*?<\/button>/g,
    );
    expect(equipmentButtons).toHaveLength(2);
    for (const button of equipmentButtons ?? []) {
      expect(button).toMatch(/\n\s+disabled\n/);
      expect(button).toContain("Coming soon");
    }
  });

  it("removes Equipment from the Shop tile catalog and owner sidebar overrides", () => {
    const tiles = read("features/shared/config/tiles.ts");
    const nav = read("features/shared/lib/ownerSidebarNav.ts");
    expect(tiles).not.toMatch(/href:\s*"\/equipment/);
    expect(nav).not.toContain('"/equipment"');
  });

  it("keeps the Equipment gate flag name and entitlement paths untouched", () => {
    const gate = read("features/stripe/lib/server/package-checkout-availability.ts");
    expect(gate).toContain("PROFIXIQ_EQUIPMENT_CHECKOUT_ENABLED");
    const entitlement = read("features/equipment/server/equipmentAddonEntitlement.ts");
    expect(entitlement).toContain("internal_demo");
  });
});
