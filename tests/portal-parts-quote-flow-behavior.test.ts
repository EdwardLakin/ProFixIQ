import { beforeEach, describe, expect, it, vi } from "vitest";
import { PortalAccessError } from "@/features/portal/server/portalAuth";

const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  notify: vi.fn(),
  paymentSettings: vi.fn(),
  createServerSupabaseRoute: vi.fn(),
  createAdminSupabase: vi.fn(),
  requirePortalCustomerActor: vi.fn(),
  createCheckout: vi.fn(),
}));

vi.mock("@/features/email/server/sendPortalPartsQuoteEmail", () => ({
  sendPortalPartsQuoteEmail: mocks.sendEmail,
}));
vi.mock("@/features/portal/server/upsertPortalNotification", () => ({
  upsertPortalNotification: mocks.notify,
}));
vi.mock("@/features/stripe/lib/server/shop-payment-settings", () => ({
  getShopPaymentSettings: mocks.paymentSettings,
}));
vi.mock("@/features/shared/lib/supabase/server", () => ({
  createServerSupabaseRoute: mocks.createServerSupabaseRoute,
  createAdminSupabase: mocks.createAdminSupabase,
}));
vi.mock("@/features/portal/server/requirePortalActor", () => ({
  requirePortalCustomerActor: mocks.requirePortalCustomerActor,
}));
vi.mock("@/features/stripe/lib/stripe/client", () => ({
  createStripeClient: () => ({}),
}));
vi.mock("@/features/stripe/lib/server/portal-parts-quote-checkout", () => ({
  createPortalPartsQuoteCheckout: mocks.createCheckout,
}));

type Result = { data: unknown; error: { message: string } | null };

/** A chainable, awaitable query stand-in that records every filter. */
function query(result: Result) {
  const calls: Array<[string, unknown[]]> = [];
  const chain: Record<string, unknown> = {
    then: (resolve: (value: Result) => unknown) => Promise.resolve(result).then(resolve),
    maybeSingle: () => Promise.resolve(result),
    returns: () => chain,
  };
  for (const method of ["select", "eq", "in", "is", "order", "limit"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return chain;
    };
  }
  return { chain, calls };
}

function fakeClient(args: {
  tables: Record<string, Result>;
  rpc?: (fn: string, params: Record<string, unknown>) => unknown;
}) {
  const queries: Record<string, ReturnType<typeof query>> = {};
  const rpc = vi.fn(async (fn: string, params: Record<string, unknown>) => {
    const out = args.rpc?.(fn, params);
    if (out instanceof Error) return { data: null, error: { message: out.message } };
    return { data: out ?? {}, error: null };
  });
  return {
    queries,
    rpc,
    client: {
      rpc,
      from: vi.fn((table: string) => {
        const result = args.tables[table];
        if (!result) throw new Error(`Unexpected table: ${table}`);
        queries[table] = query(result);
        return queries[table].chain;
      }),
    },
  };
}

const PENDING = { data: [{ id: "q-1", shop_id: "shop-1", customer_id: "cust-1" }], error: null };
const SHOP = { data: { business_name: "North Garage", tax_rate: 5 }, error: null };
const CUSTOMER = {
  data: { id: "cust-1", user_id: "user-1", email: "pat@example.com", first_name: "Pat", last_name: "Lee" },
  error: null,
};

describe("processPortalPartsQuotes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.paymentSettings.mockResolvedValue({ default_currency: "cad" });
    mocks.sendEmail.mockResolvedValue({ providerMessageId: "m-1" });
    mocks.notify.mockResolvedValue(undefined);
  });

  async function run(client: unknown) {
    const { processPortalPartsQuotes } = await import("@/features/portal/server/processPortalPartsQuotes");
    return processPortalPartsQuotes(client as never, 10);
  }

  it("prices, claims, emails a portal link, and marks the quote sent", async () => {
    const { client, rpc, queries } = fakeClient({
      tables: { portal_parts_quote_requests: PENDING, shops: SHOP, customers: CUSTOMER },
      rpc: (fn) => {
        if (fn === "price_portal_parts_quote_request") return { ok: true, status: "quoted" };
        if (fn === "claim_portal_parts_quote_request_send")
          return { claimed: true, description: "Winter tires", total: 420, currency: "cad" };
        return { ok: true };
      },
    });

    const result = await run(client);

    expect(result).toEqual({ examined: 1, quoted: 1, sent: 1, failed: 0 });
    const orders = queries.portal_parts_quote_requests.calls
      .filter(([method]) => method === "order")
      .map(([, args]) => args[0]);
    expect(orders).toEqual(["pricing_checked_at", "created_at"]);
    expect(rpc).toHaveBeenCalledWith("price_portal_parts_quote_request", {
      p_request_id: "q-1",
      p_tax_rate: 5,
      p_currency: "cad",
    });
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    const email = mocks.sendEmail.mock.calls[0][0] as Record<string, string>;
    expect(email.to).toBe("pat@example.com");
    expect(email.portalUrl).toMatch(/\/portal\/parts-quotes\/q-1$/);
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "user-1",
        kind: "parts_quote_ready",
        eventKey: "parts_quote:q-1:ready",
        href: "/portal/parts-quotes/q-1",
      }),
    );
    const names = rpc.mock.calls.map((call) => call[0]);
    expect(names).toEqual([
      "price_portal_parts_quote_request",
      "claim_portal_parts_quote_request_send",
      "mark_portal_parts_quote_request_sent",
    ]);
  });

  it("does not claim or email while items are still unpriced", async () => {
    const { client, rpc } = fakeClient({
      tables: { portal_parts_quote_requests: PENDING, shops: SHOP, customers: CUSTOMER },
      rpc: () => ({ ok: true, status: "requested", ready: false }),
    });

    const result = await run(client);

    expect(result).toEqual({ examined: 1, quoted: 0, sent: 0, failed: 0 });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("sends nothing when another worker already holds the send claim", async () => {
    const { client } = fakeClient({
      tables: { portal_parts_quote_requests: PENDING, shops: SHOP, customers: CUSTOMER },
      rpc: (fn) => (fn === "price_portal_parts_quote_request" ? { status: "quoted" } : { claimed: false }),
    });

    const result = await run(client);

    expect(result.sent).toBe(0);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("releases the claim and leaves the quote unsent when email delivery fails", async () => {
    mocks.sendEmail.mockRejectedValue(new Error("sendgrid down"));
    const { client, rpc } = fakeClient({
      tables: { portal_parts_quote_requests: PENDING, shops: SHOP, customers: CUSTOMER },
      rpc: (fn) => {
        if (fn === "price_portal_parts_quote_request") return { status: "quoted" };
        if (fn === "claim_portal_parts_quote_request_send") return { claimed: true, description: "Tires", total: 10, currency: "cad" };
        return { ok: true };
      },
    });

    const result = await run(client);

    expect(result).toMatchObject({ sent: 0, failed: 1 });
    const names = rpc.mock.calls.map((call) => call[0]);
    expect(names).toContain("release_portal_parts_quote_request_send_claim");
    expect(names).not.toContain("mark_portal_parts_quote_request_sent");
  });

  it("still marks the quote sent for a customer without an email address", async () => {
    const { client, rpc } = fakeClient({
      tables: {
        portal_parts_quote_requests: PENDING,
        shops: SHOP,
        customers: { data: { ...CUSTOMER.data, email: null }, error: null },
      },
      rpc: (fn) => {
        if (fn === "price_portal_parts_quote_request") return { status: "quoted" };
        if (fn === "claim_portal_parts_quote_request_send") return { claimed: true, description: "Tires", total: 10, currency: "cad" };
        return { ok: true };
      },
    });

    const result = await run(client);

    expect(result.sent).toBe(1);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.notify).toHaveBeenCalled();
    expect(rpc.mock.calls.map((call) => call[0])).toContain("mark_portal_parts_quote_request_sent");
  });

  it("isolates one failing quote from the rest of the batch", async () => {
    const { client } = fakeClient({
      tables: {
        portal_parts_quote_requests: {
          data: [
            { id: "q-bad", shop_id: "shop-1", customer_id: "cust-1" },
            { id: "q-good", shop_id: "shop-1", customer_id: "cust-1" },
          ],
          error: null,
        },
        shops: SHOP,
        customers: CUSTOMER,
      },
      rpc: (fn, params) => {
        if (fn === "price_portal_parts_quote_request" && params.p_request_id === "q-bad") return new Error("boom");
        if (fn === "price_portal_parts_quote_request") return { status: "quoted" };
        if (fn === "claim_portal_parts_quote_request_send") return { claimed: true, description: "Tires", total: 10, currency: "cad" };
        return { ok: true };
      },
    });

    const result = await run(client);

    expect(result).toEqual({ examined: 2, quoted: 1, sent: 1, failed: 1 });
  });
});

describe("recordPortalPartsQuoteCheckoutSession", () => {
  const REQUEST_ID = "5c1d7f70-3a38-4ed0-8a43-6f6c1f6b0a11";
  const SHOP_ID = "6c1d7f70-3a38-4ed0-8a43-6f6c1f6b0a22";
  const CUSTOMER_ID = "7c1d7f70-3a38-4ed0-8a43-6f6c1f6b0a33";

  function session(overrides: Record<string, unknown> = {}) {
    return {
      id: "cs_test_1",
      mode: "payment",
      payment_status: "paid",
      amount_total: 42000,
      payment_intent: "pi_1",
      metadata: {
        purpose: "portal_parts_quote_payment",
        parts_quote_request_id: REQUEST_ID,
        shop_id: SHOP_ID,
        customer_id: CUSTOMER_ID,
      },
      ...overrides,
    } as never;
  }

  function client(rpcResult: unknown = { ok: true }) {
    return fakeClient({
      tables: {
        portal_parts_quote_requests: {
          data: { id: REQUEST_ID, shop_id: SHOP_ID, customer_id: CUSTOMER_ID },
          error: null,
        },
        shops: { data: { stripe_account_id: "acct_shop" }, error: null },
      },
      rpc: () => rpcResult,
    });
  }

  async function record(c: ReturnType<typeof client>, s: unknown, account: string | null = "acct_shop") {
    const { recordPortalPartsQuoteCheckoutSession } = await import(
      "@/features/portal/server/recordPortalPartsQuotePayment"
    );
    return recordPortalPartsQuoteCheckoutSession({
      supabase: c.client as never,
      session: s as never,
      connectedAccountId: account,
    });
  }

  it("records a paid session once against the quote", async () => {
    const c = client();
    await expect(record(c, session())).resolves.toEqual({ recorded: true });
    expect(c.rpc).toHaveBeenCalledWith("record_portal_parts_quote_request_payment", {
      p_request_id: REQUEST_ID,
      p_session_id: "cs_test_1",
      p_payment_intent_id: "pi_1",
      p_amount_cents: 42000,
      p_connected_account_id: "acct_shop",
      p_at: expect.any(String),
    });
  });

  it("ignores unpaid sessions and sessions for other purposes", async () => {
    const unpaid = client();
    await expect(record(unpaid, session({ payment_status: "unpaid" }))).resolves.toEqual({
      recorded: false,
      reason: "not_paid",
    });
    expect(unpaid.rpc).not.toHaveBeenCalled();

    const other = client();
    await expect(record(other, session({ metadata: { purpose: "portal_invoice_payment" } }))).resolves.toEqual({
      recorded: false,
      reason: "not_parts_quote_session",
    });
    expect(other.rpc).not.toHaveBeenCalled();
  });

  it("rejects a session whose shop or customer does not match the quote", async () => {
    const c = client();
    const forged = session({
      metadata: {
        purpose: "portal_parts_quote_payment",
        parts_quote_request_id: REQUEST_ID,
        shop_id: "9c1d7f70-3a38-4ed0-8a43-6f6c1f6b0a99",
        customer_id: CUSTOMER_ID,
      },
    });
    await expect(record(c, forged)).resolves.toEqual({ recorded: false, reason: "request_mismatch" });
    expect(c.rpc).not.toHaveBeenCalled();
  });

  it("rejects a payment from a different connected account", async () => {
    const c = client();
    await expect(record(c, session(), "acct_other")).resolves.toEqual({
      recorded: false,
      reason: "account_mismatch",
    });
    expect(c.rpc).not.toHaveBeenCalled();
  });

  it("surfaces a rejected amount without throwing, so Stripe does not retry forever", async () => {
    const c = client({ ok: false, error: "amount_mismatch" });
    await expect(record(c, session())).resolves.toEqual({ recorded: false, reason: "amount_mismatch" });
  });

  it("throws on a database failure so the webhook is retried", async () => {
    const c = client(new Error("db down"));
    await expect(record(c, session())).rejects.toThrow("db down");
  });
});

describe("listPortalPartsQuotes tenant scope", () => {
  it("always filters by the verified shop and customer", async () => {
    const { client, queries } = fakeClient({
      tables: { portal_parts_quote_requests: { data: [], error: null } },
    });
    const { listPortalPartsQuotes } = await import("@/features/portal/server/portalPartsQuotes");

    await listPortalPartsQuotes({
      admin: client as never,
      shopId: "shop-1",
      customerId: "cust-1",
      id: "q-1",
    });

    const eqs = queries.portal_parts_quote_requests.calls.filter(([m]) => m === "eq").map(([, a]) => a);
    expect(eqs).toContainEqual(["shop_id", "shop-1"]);
    expect(eqs).toContainEqual(["customer_id", "cust-1"]);
    expect(eqs).toContainEqual(["id", "q-1"]);
  });
});

describe("parts quote API routes", () => {
  const ACTOR = {
    userId: "user-1",
    customer: { id: "cust-1", shop_id: "shop-1" },
    inviteEvidence: {},
  };
  const QUOTE_ID = "5c1d7f70-3a38-4ed0-8a43-6f6c1f6b0a11";

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePortalCustomerActor.mockResolvedValue(ACTOR);
  });

  it("rejects unauthenticated portal callers on every route", async () => {
    mocks.requirePortalCustomerActor.mockRejectedValue(new PortalAccessError("Not authenticated", 401));
    mocks.createServerSupabaseRoute.mockReturnValue({});
    const params = { params: Promise.resolve({ id: QUOTE_ID }) };

    const list = await import("../app/api/portal/parts-quotes/route");
    const decision = await import("../app/api/portal/parts-quotes/[id]/decision/route");
    const checkout = await import("../app/api/portal/parts-quotes/[id]/checkout/route");
    process.env.STRIPE_SECRET_KEY = "sk_test_x";

    const responses = await Promise.all([
      list.GET(),
      list.POST(new Request("https://x.test", { method: "POST", body: "{}" })),
      decision.POST(new Request("https://x.test", { method: "POST", body: "{}" }), params),
      checkout.POST(new Request("https://x.test", { method: "POST" }), params),
    ]);
    expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401]);
  });

  it("creates a request for the verified customer, ignoring identity in the body", async () => {
    const { client, rpc } = fakeClient({
      tables: {},
      rpc: () => ({ ok: true, requestId: QUOTE_ID, partRequestId: "pr-1", status: "requested", idempotent: false }),
    });
    mocks.createServerSupabaseRoute.mockReturnValue(client);
    const { POST } = await import("../app/api/portal/parts-quotes/route");

    const response = await POST(
      new Request("https://x.test", {
        method: "POST",
        headers: { "Idempotency-Key": "key-1" },
        body: JSON.stringify({
          vehicleId: "veh-1",
          description: "Winter tires",
          qty: 4,
          customerId: "attacker-customer",
          shopId: "attacker-shop",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith(
      "create_portal_parts_quote_request_atomic",
      expect.objectContaining({
        p_shop_id: "shop-1",
        p_customer_id: "cust-1",
        p_actor_user_id: "user-1",
        p_vehicle_id: "veh-1",
        p_qty: 4,
        p_operation_key: "shop-1:portal-parts-quote:key-1",
      }),
    );
  });

  it("requires a stable idempotency key and a description", async () => {
    mocks.createServerSupabaseRoute.mockReturnValue(fakeClient({ tables: {} }).client);
    const { POST } = await import("../app/api/portal/parts-quotes/route");

    const missingKey = await POST(
      new Request("https://x.test", { method: "POST", body: JSON.stringify({ vehicleId: "v", description: "Tires" }) }),
    );
    expect(missingKey.status).toBe(400);

    const missingText = await POST(
      new Request("https://x.test", {
        method: "POST",
        headers: { "Idempotency-Key": "k" },
        body: JSON.stringify({ vehicleId: "v", description: "" }),
      }),
    );
    expect(missingText.status).toBe(400);
  });

  it("passes the verified actor to the decision function and maps its errors", async () => {
    const decisions: Array<Record<string, unknown>> = [];
    const { client } = fakeClient({
      tables: {},
      rpc: (_fn, params) => {
        decisions.push(params);
        return params.p_decision === "approve" && params.p_choice === "order_parts"
          ? { ok: true, status: "approved", choice: "order_parts", idempotent: false }
          : new Error("This quote is no longer awaiting your decision.");
      },
    });
    mocks.createServerSupabaseRoute.mockReturnValue(client);
    const { POST } = await import("../app/api/portal/parts-quotes/[id]/decision/route");
    const params = { params: Promise.resolve({ id: QUOTE_ID }) };

    const approved = await POST(
      new Request("https://x.test", { method: "POST", body: JSON.stringify({ decision: "approve", choice: "order_parts" }) }),
      params,
    );
    expect(approved.status).toBe(200);
    expect(decisions[0]).toMatchObject({ p_request_id: QUOTE_ID, p_customer_id: "cust-1", p_actor_user_id: "user-1" });

    const stale = await POST(
      new Request("https://x.test", { method: "POST", body: JSON.stringify({ decision: "decline" }) }),
      params,
    );
    expect(stale.status).toBe(409);

    const bad = await POST(new Request("https://x.test", { method: "POST", body: JSON.stringify({ decision: "maybe" }) }), params);
    expect(bad.status).toBe(400);
  });

  it("returns the same 404 for a quote the customer does not own", async () => {
    mocks.createServerSupabaseRoute.mockReturnValue({});
    mocks.createAdminSupabase.mockReturnValue(
      fakeClient({ tables: { portal_parts_quote_requests: { data: [], error: null } } }).client,
    );
    const { GET } = await import("../app/api/portal/parts-quotes/[id]/route");

    const unowned = await GET(new Request("https://x.test"), { params: Promise.resolve({ id: QUOTE_ID }) });
    expect(unowned.status).toBe(404);
    const malformed = await GET(new Request("https://x.test"), { params: Promise.resolve({ id: "nope" }) });
    expect(malformed.status).toBe(404);
  });

  it("only starts checkout for an approved, unpaid quote and charges the stored total", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    mocks.createServerSupabaseRoute.mockReturnValue({
      auth: { getUser: async () => ({ data: { user: { email: "pat@example.com" } } }) },
    });
    const { POST } = await import("../app/api/portal/parts-quotes/[id]/checkout/route");
    const params = { params: Promise.resolve({ id: QUOTE_ID }) };
    const row = (overrides: Record<string, unknown>) => ({
      data: { id: QUOTE_ID, shop_id: "shop-1", customer_id: "cust-1", status: "approved", description: "Tires", total: 420.5, currency: "cad", paid_at: null, ...overrides },
      error: null,
    });

    mocks.createAdminSupabase.mockReturnValue(fakeClient({ tables: { portal_parts_quote_requests: row({ status: "sent" }) } }).client);
    expect((await POST(new Request("https://x.test", { method: "POST" }), params)).status).toBe(409);

    mocks.createAdminSupabase.mockReturnValue(fakeClient({ tables: { portal_parts_quote_requests: row({ paid_at: "2026-10-04T00:00:00Z" }) } }).client);
    expect((await POST(new Request("https://x.test", { method: "POST" }), params)).status).toBe(409);

    mocks.createAdminSupabase.mockReturnValue(fakeClient({ tables: { portal_parts_quote_requests: row({}) } }).client);
    mocks.createCheckout.mockResolvedValue({ url: "https://checkout.stripe.test/s" });
    const ok = await POST(new Request("https://x.test", { method: "POST" }), params);
    expect(ok.status).toBe(200);
    await expect(ok.json()).resolves.toEqual({ url: "https://checkout.stripe.test/s" });
    expect(mocks.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: "shop-1", requestId: QUOTE_ID, totalCents: 42050, customerId: "cust-1" }),
    );
  });
});

describe("createPortalPartsQuoteCheckout", () => {
  const base = {
    shopId: "shop-1",
    requestId: "q-1",
    description: "Winter tires",
    totalCents: 42000,
    currency: "cad",
    customerEmail: "pat@example.com",
    customerId: "cust-1",
    createdBy: "user-1",
    successUrl: "https://app.test/ok",
    cancelUrl: "https://app.test/cancel",
  };

  function setup(shop: Record<string, unknown> | null, settings: Record<string, unknown>) {
    mocks.paymentSettings.mockResolvedValue({
      portal_payments_enabled: true,
      default_currency: "cad",
      platform_fee_bps: 100,
      minimum_payment_cents: 50,
      receipt_email_enabled: true,
      ...settings,
    });
    const create = vi.fn(async () => ({ id: "cs_1", url: "https://checkout.test" }));
    const { client } = fakeClient({ tables: { shops: { data: shop, error: null } } });
    return { create, client, stripe: { checkout: { sessions: { create } } } };
  }

  const READY_SHOP = {
    id: "shop-1",
    stripe_account_id: "acct_shop",
    stripe_charges_enabled: true,
    stripe_payouts_enabled: true,
    stripe_connect_charge_model: "direct",
  };

  async function checkout(s: ReturnType<typeof setup>, overrides: Record<string, unknown> = {}) {
    const { createPortalPartsQuoteCheckout } = await import(
      "@/features/stripe/lib/server/portal-parts-quote-checkout"
    );
    return createPortalPartsQuoteCheckout({
      ...base,
      ...overrides,
      stripe: s.stripe as never,
      supabase: s.client as never,
    });
  }

  beforeEach(() => vi.clearAllMocks());

  it("creates a direct charge on the shop's connected account with the platform fee", async () => {
    // The route tests above mock this module; load the real implementation.
    vi.doUnmock("@/features/stripe/lib/server/portal-parts-quote-checkout");
    vi.resetModules();
    const s = setup(READY_SHOP, {});
    await checkout(s);

    expect(s.create).toHaveBeenCalledTimes(1);
    type Json = Record<string, unknown>;
    const calls = s.create.mock.calls as unknown as Array<[Json & { line_items: Array<{ price_data: { unit_amount: number } }>; payment_intent_data: { application_fee_amount: number }; metadata: Json }, Json]>;
    const [params, options] = calls[0];
    expect(options.stripeAccount).toBe("acct_shop");
    expect(options.idempotencyKey).toBe("profixiq:parts-quote-checkout:shop-1:q-1:42000");
    expect(params.line_items[0].price_data.unit_amount).toBe(42000);
    expect(params.payment_intent_data.application_fee_amount).toBe(420);
    expect(params.metadata).toMatchObject({
      purpose: "portal_parts_quote_payment",
      parts_quote_request_id: "q-1",
      shop_id: "shop-1",
      customer_id: "cust-1",
    });
  });

  it("refuses shops that are not ready to take payments", async () => {
    vi.doUnmock("@/features/stripe/lib/server/portal-parts-quote-checkout");
    vi.resetModules();
    await expect(checkout(setup({ ...READY_SHOP, stripe_account_id: null }, {}))).rejects.toThrow(/not connected/);
    await expect(checkout(setup({ ...READY_SHOP, stripe_charges_enabled: false }, {}))).rejects.toThrow(/not complete/);
    await expect(checkout(setup({ ...READY_SHOP, stripe_connect_charge_model: "destination" }, {}))).rejects.toThrow(/upgraded/);
    await expect(checkout(setup(READY_SHOP, { portal_payments_enabled: false }))).rejects.toThrow(/disabled/);
    await expect(checkout(setup(READY_SHOP, {}), { totalCents: 10 })).rejects.toThrow(/no payable/);
  });
});
