import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  claimStripeWebhookEvent,
  completeStripeWebhookEvent,
} from "../features/stripe/lib/server/stripe-webhook-receipts";

vi.mock("@/features/stripe/lib/server/subscription-discovery", () => ({
  collectCustomerSubscriptionDiagnostics: vi.fn(),
}));

const SHOP_ID = "8b100000-0000-4000-8000-000000000001";
const EVENT_ID = "evt_p1012_ordered";
const EVENT_CREATED_AT = "2026-07-27T02:00:00.000Z";

function subscription() {
  return {
    id: "sub_p1012shop",
    customer: "cus_p1012shop",
    status: "active",
    trial_end: null,
    current_period_end: 1_787_788_800,
    items: {
      data: [
        {
          price: {
            id: "price_p1012pro",
            lookup_key: "profixiq_pro50_monthly",
            nickname: "Complete 50",
          },
        },
      ],
    },
  };
}

describe("P1-012 Stripe subscription ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends the retrieved canonical subscription through the monotonic snapshot RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const from = vi.fn(() => {
      throw new Error("ordered webhook sync must not update shops directly");
    });
    const retrieve = vi.fn().mockResolvedValue(subscription());
    const { syncCanonicalShopBilling } =
      await import("../features/stripe/lib/server/canonical-shop-billing");

    const result = await syncCanonicalShopBilling({
      stripe: { subscriptions: { retrieve } } as never,
      supabase: { rpc, from } as never,
      shopId: SHOP_ID,
      customerId: "cus_p1012shop",
      subscriptionId: "sub_p1012shop",
      webhookEvent: { id: EVENT_ID, createdAt: EVENT_CREATED_AT },
    });

    expect(result).toEqual({ applied: true });
    expect(retrieve).toHaveBeenCalledWith("sub_p1012shop");
    expect(rpc).toHaveBeenCalledWith(
      "apply_stripe_subscription_webhook_snapshot",
      {
        p_shop_id: SHOP_ID,
        p_customer_id: "cus_p1012shop",
        p_subscription_id: "sub_p1012shop",
        p_event_id: EVENT_ID,
        p_event_created_at: EVENT_CREATED_AT,
        p_snapshot: {
          stripe_subscription_status: "active",
          stripe_trial_end: null,
          stripe_current_period_end: new Date(
            1_787_788_800 * 1000,
          ).toISOString(),
          plan: "pro",
          stripe_checkout_session_id: null,
        },
      },
    );
    expect(from).not.toHaveBeenCalled();
  });

  it("maps receipt claims and completes only with the durable claim token", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            claimed: true,
            already_processed: false,
            in_progress: false,
            claim_token: "7a100000-0000-4000-8000-000000000001",
            attempt_count: 2,
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null });
    const event = {
      id: EVENT_ID,
      type: "customer.subscription.updated",
      livemode: true,
      account: undefined,
      created: 1_785_109_200,
      data: { object: { id: "sub_p1012shop" } },
    };

    const claim = await claimStripeWebhookEvent({
      supabase: { rpc } as never,
      event: event as never,
    });
    expect(claim).toEqual({
      claimed: true,
      alreadyProcessed: false,
      inProgress: false,
      claimToken: "7a100000-0000-4000-8000-000000000001",
      attemptCount: 2,
    });

    await completeStripeWebhookEvent({
      supabase: { rpc } as never,
      eventId: EVENT_ID,
      claimToken: claim.claimToken ?? "",
    });

    expect(rpc).toHaveBeenNthCalledWith(1, "claim_stripe_webhook_event", {
      p_event_id: EVENT_ID,
      p_event_type: "customer.subscription.updated",
      p_livemode: true,
      p_stripe_account_id: "",
      p_object_id: "sub_p1012shop",
      p_event_created_at: new Date(1_785_109_200 * 1000).toISOString(),
      p_lease_seconds: 300,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "complete_stripe_webhook_event", {
      p_event_id: EVENT_ID,
      p_claim_token: "7a100000-0000-4000-8000-000000000001",
    });
  });

  it("rejects a malformed claim response instead of acknowledging an unclaimed event", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          claimed: false,
          already_processed: false,
          in_progress: false,
          claim_token: null,
          attempt_count: 1,
        },
      ],
      error: null,
    });

    await expect(
      claimStripeWebhookEvent({
        supabase: { rpc } as never,
        event: {
          id: EVENT_ID,
          type: "customer.subscription.updated",
          livemode: true,
          created: 1_785_109_200,
          data: { object: { id: "sub_p1012shop" } },
        } as never,
      }),
    ).rejects.toThrow("invalid receipt");
  });
});
