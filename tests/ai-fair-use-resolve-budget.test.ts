import { describe, expect, it } from "vitest";

import { resolveShopAIFairUseBudgetUsd } from "../features/shared/lib/server/ai-fair-use";

const SHOP_ID = "20000000-0000-4000-8000-000000000001";

function fixtureAdmin(input: {
  stripeSubscriptionStatus: string | null;
  stripePricingModel: string;
  subscriptionPackage: string;
  billingCatalogCurrency: string | null;
  profiles: Array<{ role: string }>;
}) {
  const shopsResult = {
    data: {
      stripe_pricing_model: input.stripePricingModel,
      subscription_package: input.subscriptionPackage,
      stripe_subscription_status: input.stripeSubscriptionStatus,
      billing_catalog_currency: input.billingCatalogCurrency,
    },
    error: null,
  };
  const profilesResult = { data: input.profiles, error: null };

  const from = (table: string) => {
    const result = table === "shops" ? shopsResult : profilesResult;
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => result,
      then: (
        resolve: (value: typeof result) => unknown,
        reject: (reason: unknown) => unknown,
      ) => Promise.resolve(result).then(resolve, reject),
    };
    return query;
  };

  return { from } as never;
}

describe("resolveShopAIFairUseBudgetUsd", () => {
  it("grants zero budget when the subscription is not entitled", async () => {
    const admin = fixtureAdmin({
      stripeSubscriptionStatus: "canceled",
      stripePricingModel: "product_packages_v1",
      subscriptionPackage: "shop_operations",
      billingCatalogCurrency: "usd",
      profiles: [{ role: "owner" }],
    });

    // A canceled subscription must never fall back to a nonzero default —
    // that would keep authorizing AI spend against revenue that no longer
    // exists.
    expect(await resolveShopAIFairUseBudgetUsd(admin, SHOP_ID)).toBe(0);
  });

  it("still grants budget while trialing, since Stripe still considers the shop entitled", async () => {
    const admin = fixtureAdmin({
      stripeSubscriptionStatus: "trialing",
      stripePricingModel: "product_packages_v1",
      subscriptionPackage: "shop_operations",
      billingCatalogCurrency: "usd",
      profiles: [{ role: "owner" }],
    });

    expect(await resolveShopAIFairUseBudgetUsd(admin, SHOP_ID)).toBe(59.8);
  });

  it("excludes Fleet-portal and dispatcher/driver profiles from its own staff count", async () => {
    const admin = fixtureAdmin({
      stripeSubscriptionStatus: "active",
      stripePricingModel: "product_packages_v1",
      subscriptionPackage: "shop_operations",
      billingCatalogCurrency: "usd",
      profiles: [
        { role: "owner" },
        { role: "fleet_manager" },
        { role: "dispatcher" },
        { role: "driver" },
      ],
    });

    // Only the one real staff profile should count. If the other three were
    // counted, this shop would appear to have 4 users (still within the 10
    // included) rather than the correct 1 — in a larger shop that difference
    // would inflate both the seat count and the revenue estimate it drives.
    expect(await resolveShopAIFairUseBudgetUsd(admin, SHOP_ID)).toBe(59.8);
  });

  it("prices a CAD-grandfathered shop off its real base instead of the USD list price", async () => {
    const admin = fixtureAdmin({
      stripeSubscriptionStatus: "active",
      stripePricingModel: "product_packages_v1",
      subscriptionPackage: "complete_operations",
      billingCatalogCurrency: "cad",
      profiles: Array.from({ length: 20 }, () => ({ role: "owner" })),
    });

    // $449 CAD base, no seat charges — not $499 USD plus 10 extra seats.
    expect(await resolveShopAIFairUseBudgetUsd(admin, SHOP_ID)).toBe(89.8);
  });
});
