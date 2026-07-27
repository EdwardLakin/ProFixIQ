import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SHOP_ID = "8a100000-0000-4000-8000-000000000001";
const EVENT_CREATED = 1_785_109_200;

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  complete: vi.fn(),
  fail: vi.fn(),
  constructEvent: vi.fn(),
  syncCanonicalShopBilling: vi.fn(),
}));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: () => ({ rpc: vi.fn(), from: vi.fn() }),
}));

vi.mock("@/features/stripe/lib/stripe/client", () => ({
  createStripeClient: () => ({
    webhooks: { constructEvent: mocks.constructEvent },
  }),
}));

vi.mock("@/features/stripe/lib/server/canonical-shop-billing", () => ({
  syncCanonicalShopBilling: mocks.syncCanonicalShopBilling,
}));

vi.mock("@/features/stripe/lib/server/stripe-webhook-receipts", () => ({
  claimStripeWebhookEvent: mocks.claim,
  completeStripeWebhookEvent: mocks.complete,
  failStripeWebhookEvent: mocks.fail,
}));

vi.mock("@/features/stripe/lib/server/stripe-acquisition-intent", () => ({
  STRIPE_ACQUISITION_PURPOSE: "profixiq_acquisition",
  getStripeCheckoutEmail: vi.fn(),
  getStripeCheckoutPriceId: vi.fn(),
  isCompletedStripeAcquisitionSession: vi.fn(),
  readStripeAcquisitionMetadata: vi.fn(),
  recordStripeAcquisitionCompletion: vi.fn(),
  toStripeId: (value: unknown, prefix: string) =>
    typeof value === "string" && value.startsWith(prefix) ? value : null,
}));

vi.mock("@/features/invoices/server/financialLifecycle", () => ({
  getActiveInvoiceVersion: vi.fn(),
  postPaymentEvent: vi.fn(),
}));

function subscriptionEvent(id: string) {
  return {
    id,
    object: "event",
    api_version: "2025-02-24.acacia",
    created: EVENT_CREATED,
    data: {
      object: {
        id: "sub_p1012",
        object: "subscription",
        customer: "cus_p1012",
        metadata: { shop_id: SHOP_ID },
      },
    },
    livemode: true,
    pending_webhooks: 1,
    request: null,
    type: "customer.subscription.updated",
  };
}

function request(): Request {
  return new Request("https://profixiq.test/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "signed" },
    body: "raw-stripe-body",
  });
}

describe("P1-012 Stripe webhook delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_p1012");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_p1012");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://p1012.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-p1012");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.complete.mockResolvedValue(undefined);
    mocks.fail.mockResolvedValue(undefined);
    mocks.syncCanonicalShopBilling.mockResolvedValue({ applied: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("acknowledges a durable duplicate without repeating subscription side effects", async () => {
    const event = subscriptionEvent("evt_p1012_duplicate");
    mocks.constructEvent.mockReturnValue(event);
    mocks.claim.mockResolvedValue({
      claimed: false,
      alreadyProcessed: true,
      inProgress: false,
      claimToken: null,
      attemptCount: 1,
    });

    const { handleStripeWebhook } =
      await import("../features/stripe/api/stripe/webhook/route");
    const response = await handleStripeWebhook(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      received: true,
      duplicate: true,
    });
    expect(mocks.syncCanonicalShopBilling).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("asks Stripe to retry a concurrent delivery until the active claim completes", async () => {
    const event = subscriptionEvent("evt_p1012_in_progress");
    mocks.constructEvent.mockReturnValue(event);
    mocks.claim.mockResolvedValue({
      claimed: false,
      alreadyProcessed: false,
      inProgress: true,
      claimToken: null,
      attemptCount: 1,
    });

    const { handleStripeWebhook } =
      await import("../features/stripe/api/stripe/webhook/route");
    const response = await handleStripeWebhook(request());

    expect(response.status).toBe(409);
    expect(response.headers.get("Retry-After")).toBe("300");
    await expect(response.json()).resolves.toEqual({
      received: false,
      retry: true,
    });
    expect(mocks.syncCanonicalShopBilling).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.fail).not.toHaveBeenCalled();
  });

  it("completes a claimed event after applying a timestamped subscription snapshot", async () => {
    const event = subscriptionEvent("evt_p1012_claimed");
    mocks.constructEvent.mockReturnValue(event);
    mocks.claim.mockResolvedValue({
      claimed: true,
      alreadyProcessed: false,
      inProgress: false,
      claimToken: "7a100000-0000-4000-8000-000000000001",
      attemptCount: 1,
    });

    const { handleStripeWebhook } =
      await import("../features/stripe/api/stripe/webhook/route");
    const response = await handleStripeWebhook(request());

    expect(response.status).toBe(200);
    expect(mocks.syncCanonicalShopBilling).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: SHOP_ID,
        customerId: "cus_p1012",
        subscriptionId: "sub_p1012",
        webhookEvent: {
          id: event.id,
          createdAt: new Date(EVENT_CREATED * 1000).toISOString(),
        },
      }),
    );
    expect(mocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: event.id,
        claimToken: "7a100000-0000-4000-8000-000000000001",
      }),
    );
    expect(mocks.fail).not.toHaveBeenCalled();
  });

  it("marks a claimed event failed so Stripe can retry it", async () => {
    const event = subscriptionEvent("evt_p1012_retry");
    const processingError = new Error("subscription persistence unavailable");
    mocks.constructEvent.mockReturnValue(event);
    mocks.claim.mockResolvedValue({
      claimed: true,
      alreadyProcessed: false,
      inProgress: false,
      claimToken: "7a100000-0000-4000-8000-000000000002",
      attemptCount: 1,
    });
    mocks.syncCanonicalShopBilling.mockRejectedValue(processingError);

    const { handleStripeWebhook } =
      await import("../features/stripe/api/stripe/webhook/route");
    const response = await handleStripeWebhook(request());

    expect(response.status).toBe(500);
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.fail).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: event.id,
        claimToken: "7a100000-0000-4000-8000-000000000002",
        error: processingError,
      }),
    );
  });
});
