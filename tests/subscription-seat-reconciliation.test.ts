import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

import { reconcileShopSubscriptionSeats } from "../features/stripe/lib/server/subscription-seat-reconciliation";
import type { StripePriceContract } from "../features/stripe/lib/server/stripe-price-contract";

const SHOP_ID = "30000000-0000-4000-8000-000000000001";

const priceContract: StripePriceContract = {
  basePriceId: "price_base",
  additionalSeatPriceId: "price_seat",
  unlimitedPriceId: "price_unlimited",
};

function item(priceId: string, lookupKey: string, quantity = 1): Stripe.SubscriptionItem {
  return {
    id: `si_${priceId}`,
    quantity,
    price: { id: priceId, lookup_key: lookupKey },
  } as Stripe.SubscriptionItem;
}

describe("reconcileShopSubscriptionSeats staff count", () => {
  it("never bills Fleet-portal or dispatcher/driver profiles as chargeable Stripe seats", async () => {
    // 10 real staff + a Fleet-portal invitee + a shop-provisioned dispatcher.
    // An unfiltered count (12) would compute 2 additional chargeable seats
    // and try to add a seat item; the correct filtered count (10) is exactly
    // the included allowance, so the subscription is already synced as-is.
    const profiles = [
      ...Array.from({ length: 10 }, () => ({ role: "owner" })),
      { role: "fleet_manager" },
      { role: "dispatcher" },
    ];

    const from = vi.fn((table: string) => {
      const result = () => {
        if (table === "profiles") return { data: profiles, error: null };
        return { data: null, error: null };
      };
      const query = {
        select: () => query,
        eq: () => query,
        update: () => query,
        maybeSingle: async () => ({
          data: {
            id: SHOP_ID,
            stripe_customer_id: "cus_1",
            stripe_subscription_id: "sub_1",
            stripe_subscription_status: "active",
            billable_user_count: null,
          },
          error: null,
        }),
        then: (
          resolve: (value: ReturnType<typeof result>) => unknown,
          reject: (reason: unknown) => unknown,
        ) => Promise.resolve(result()).then(resolve, reject),
      };
      return query;
    });

    const subscription = {
      id: "sub_1",
      status: "active",
      current_period_start: 1_786_406_400,
      items: {
        data: [item("price_base", "profixiq_base_monthly_v2")],
      },
    } as unknown as Stripe.Subscription;

    const update = vi.fn().mockResolvedValue(subscription);

    const result = await reconcileShopSubscriptionSeats({
      stripe: {
        subscriptions: { retrieve: vi.fn().mockResolvedValue(subscription), update },
      } as never,
      supabase: { from } as never,
      shopId: SHOP_ID,
      priceContract,
    });

    expect(result).toMatchObject({
      state: "already_synced",
      active_users: 10,
      additional_seat_quantity: 0,
      estimated_monthly_price: 299,
    });
    expect(update).not.toHaveBeenCalled();
  });
});
