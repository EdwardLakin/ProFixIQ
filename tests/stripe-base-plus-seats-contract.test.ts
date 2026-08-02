import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import {
  ADDITIONAL_SEAT_LOOKUP_KEY,
  ADDITIONAL_USER_MONTHLY_PRICE,
  BASE_MONTHLY_PRICE,
  BASE_PRICE_LOOKUP_KEY,
  INCLUDED_USERS,
  UNLIMITED_MONTHLY_PRICE,
  UNLIMITED_PRICE_LOOKUP_KEY,
  UNLIMITED_USER_THRESHOLD,
  calculateMonthlySubscriptionPrice,
  getAdditionalSeatQuantity,
} from "../features/stripe/lib/stripe/billing-model";
import { resolveStripePriceContract } from "../features/stripe/lib/server/stripe-price-contract";

const SEAT_RECONCILER =
  "features/stripe/lib/server/subscription-seat-reconciliation.ts";
const PRICE_CONTRACT = "features/stripe/lib/server/stripe-price-contract.ts";
const CHECKOUT = "app/api/stripe/checkout/route.ts";
const CRON = "app/api/internal/stripe/reconcile-pending-billing/route.ts";

function recurringPrice(input: {
  id: string;
  lookupKey: string;
  amount: number;
  role: "base" | "additional_seat" | "unlimited";
}): Stripe.Price {
  return {
    id: input.id,
    object: "price",
    active: true,
    billing_scheme: "per_unit",
    created: 1,
    currency: "cad",
    custom_unit_amount: null,
    livemode: true,
    lookup_key: input.lookupKey,
    metadata: {
      app: "profixiq",
      billing_model: "base_plus_seats_v2",
      price_role: input.role,
    },
    nickname: null,
    product: "prod_test",
    recurring: {
      interval: "month",
      interval_count: 1,
      meter: null,
      trial_period_days: null,
      usage_type: "licensed",
    },
    tax_behavior: "exclusive",
    tiers_mode: null,
    transform_quantity: null,
    type: "recurring",
    unit_amount: input.amount,
    unit_amount_decimal: String(input.amount),
  } as Stripe.Price;
}

describe("ProFixIQ base plus seats billing contract", () => {
  it("matches the agreed monthly commercial model", () => {
    expect(BASE_MONTHLY_PRICE).toBe(299);
    expect(INCLUDED_USERS).toBe(10);
    expect(ADDITIONAL_USER_MONTHLY_PRICE).toBe(50);
    expect(UNLIMITED_MONTHLY_PRICE).toBe(600);
    expect(UNLIMITED_USER_THRESHOLD).toBe(17);
    expect(getAdditionalSeatQuantity(16)).toBe(6);
    expect(calculateMonthlySubscriptionPrice(16)).toBe(599);
    expect(calculateMonthlySubscriptionPrice(17)).toBe(600);
  });

  it("resolves and validates the live catalog by lookup key", async () => {
    const list = vi.fn().mockResolvedValue({
      data: [
        recurringPrice({
          id: "price_base",
          lookupKey: BASE_PRICE_LOOKUP_KEY,
          amount: 29_900,
          role: "base",
        }),
        recurringPrice({
          id: "price_seat",
          lookupKey: ADDITIONAL_SEAT_LOOKUP_KEY,
          amount: 5_000,
          role: "additional_seat",
        }),
        recurringPrice({
          id: "price_unlimited",
          lookupKey: UNLIMITED_PRICE_LOOKUP_KEY,
          amount: 60_000,
          role: "unlimited",
        }),
      ],
    });

    await expect(
      resolveStripePriceContract({ prices: { list } } as never),
    ).resolves.toEqual({
      basePriceId: "price_base",
      additionalSeatPriceId: "price_seat",
      unlimitedPriceId: "price_unlimited",
    });
    expect(list).toHaveBeenCalledWith({
      active: true,
      lookup_keys: [
        BASE_PRICE_LOOKUP_KEY,
        ADDITIONAL_SEAT_LOOKUP_KEY,
        UNLIMITED_PRICE_LOOKUP_KEY,
      ],
      limit: 20,
    });
  });

  it("fails closed when the catalog amount drifts", async () => {
    const list = vi.fn().mockResolvedValue({
      data: [
        recurringPrice({
          id: "price_base",
          lookupKey: BASE_PRICE_LOOKUP_KEY,
          amount: 30_000,
          role: "base",
        }),
        recurringPrice({
          id: "price_seat",
          lookupKey: ADDITIONAL_SEAT_LOOKUP_KEY,
          amount: 5_000,
          role: "additional_seat",
        }),
        recurringPrice({
          id: "price_unlimited",
          lookupKey: UNLIMITED_PRICE_LOOKUP_KEY,
          amount: 60_000,
          role: "unlimited",
        }),
      ],
    });

    await expect(
      resolveStripePriceContract({ prices: { list } } as never),
    ).rejects.toThrow("Stripe price amount mismatch");
  });

  it("invoices increases immediately and avoids retroactive credits on decreases", async () => {
    const source = await readFile(SEAT_RECONCILER, "utf8");
    expect(source).toContain('"always_invoice"');
    expect(source).toContain('"none"');
    expect(source).toContain("estimatedMonthlyPrice > currentMonthlyPrice");
    expect(source).toContain("shouldUseUnlimitedPrice(activeUsers)");
    expect(source).toContain("stripe_billing_sync_required: false");
    expect(source).toContain("resolveStripePriceContract(stripe)");
    expect(source).not.toContain("STRIPE_PRICE_ADDITIONAL_SEAT_MONTHLY");
  });

  it("does not expose legacy capped plans or price IDs to new checkout", async () => {
    const source = await readFile(CHECKOUT, "utf8");
    expect(source).toContain('planKey: z.enum(["starter", "unlimited"])');
    expect(source).toContain("resolveStripePlanPriceId(stripe, parsed.data.planKey)");
    expect(source).not.toContain('"pro", "unlimited"');
    expect(source).not.toContain("STRIPE_FOUNDING_COUPON_ID");
    expect(source).not.toContain("STRIPE_PRICE_BASE_MONTHLY");
    expect(source).not.toContain("payment_method_types");
  });

  it("keeps the lookup-key catalog contract explicit", async () => {
    const source = await readFile(PRICE_CONTRACT, "utf8");
    expect(source).toContain("Expected exactly one active Stripe price");
    expect(source).toContain('price.currency !== "cad"');
    expect(source).toContain('price.metadata?.app !== "profixiq"');
    expect(source).toContain('price.metadata?.billing_model !== "base_plus_seats_v2"');
  });

  it("reconciles pending seat changes on a protected worker", async () => {
    const source = await readFile(CRON, "utf8");
    expect(source).toContain('eq("stripe_billing_sync_required", true)');
    expect(source).toContain("resolveStripePriceContract(stripe)");
    expect(source).toContain("priceContract,");
    expect(source).toContain("reconcileShopSubscriptionSeats");
    expect(source).toContain("CRON_SECRET");
  });
});
