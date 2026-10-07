import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
type Call = { table: string; op: string; payload?: unknown };

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Row | null>,
  calls: [] as Array<{ table: string; op: string; payload?: unknown }>,
}));

vi.mock("server-only", () => ({}));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: () => ({
    from(table: string) {
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = chain;
      builder.eq = chain;
      builder.order = chain;
      builder.limit = chain;
      builder.returns = chain;
      builder.update = (payload: unknown) => {
        state.calls.push({ table, op: "update", payload });
        return builder;
      };
      builder.maybeSingle = async () => ({
        data: state.tables[table] ?? null,
        error: null,
      });
      return builder;
    },
  }),
}));

import {
  deferEarlyAccessGrantShopBinding,
  findEarlyAccessGrantByToken,
  validateEarlyAccessCheckoutBeforeClaim,
} from "@/features/stripe/lib/server/early-access-discount";

const GRANT_ID = "11111111-1111-4111-8111-111111111111";
const APPLICATION_ID = "22222222-2222-4222-8222-222222222222";
const SHOP_ID = "33333333-3333-4333-8333-333333333333";
const NAMESPACE = "a".repeat(32);

function grantRow(overrides: Row = {}, metadata: Row = {}): Row {
  return {
    id: GRANT_ID,
    shop_id: null,
    stripe_coupon_id: "coupon_1",
    percent_off: 30,
    duration: "repeating",
    duration_in_months: 6,
    status: "active",
    terms_version: "v1",
    metadata: {
      purpose: "early_access",
      application_id: APPLICATION_ID,
      application_email: "owner@example.com",
      product_package: "shop_operations",
      offer_terms_version: "v1",
      approval_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      checkout_attempt_namespace: NAMESPACE,
      checkout_session_id: "cs_test_1",
      stripe_customer_id: "cus_1",
      ...metadata,
    },
    ...overrides,
  };
}

function seed(grant: Row | null) {
  state.calls.length = 0;
  state.tables = {
    billing_discount_grants: grant,
    early_access_applications: {
      id: APPLICATION_ID,
      email: "Owner@Example.com",
      company_name: "Acme Garage",
      product_package: "shop_operations",
      offer_terms_version: "v1",
      status: "approved",
    },
  };
}

const identity = {
  grantId: GRANT_ID,
  checkoutEmail: "owner@example.com",
  packageKey: "shop_operations" as const,
  checkoutSessionId: "cs_test_1",
  stripeCustomerId: "cus_1",
};

function updates(): Call[] {
  return state.calls.filter((call) => call.op === "update");
}

describe("Early Access grant validation behavior", () => {
  beforeEach(() => seed(grantRow()));

  it("accepts the matching identity on an active grant", async () => {
    await expect(validateEarlyAccessCheckoutBeforeClaim(identity)).resolves.toBeUndefined();
  });

  it("still accepts the same verified checkout after the grant was redeemed", async () => {
    seed(grantRow({ status: "redeemed", shop_id: SHOP_ID }));

    await expect(validateEarlyAccessCheckoutBeforeClaim(identity)).resolves.toBeUndefined();
  });

  it("rejects a redeemed grant that is not bound to a shop", async () => {
    seed(grantRow({ status: "redeemed", shop_id: null }));

    await expect(validateEarlyAccessCheckoutBeforeClaim(identity)).rejects.toThrow(
      /no longer active/,
    );
  });

  it("rejects a redeemed grant when the checkout identity differs", async () => {
    seed(grantRow({ status: "redeemed", shop_id: SHOP_ID }));

    await expect(
      validateEarlyAccessCheckoutBeforeClaim({ ...identity, stripeCustomerId: "cus_other" }),
    ).rejects.toThrow(/does not match/);
    await expect(
      validateEarlyAccessCheckoutBeforeClaim({ ...identity, checkoutEmail: "other@example.com" }),
    ).rejects.toThrow(/does not match/);
    await expect(
      validateEarlyAccessCheckoutBeforeClaim({ ...identity, checkoutSessionId: "cs_test_2" }),
    ).rejects.toThrow(/does not match/);
  });

  it("rejects an active grant when the checkout identity differs", async () => {
    await expect(
      validateEarlyAccessCheckoutBeforeClaim({ ...identity, packageKey: "fleet_maintenance" }),
    ).rejects.toThrow(/does not match/);
  });

  it("rejects declined/expired/revoked grants", async () => {
    seed(grantRow({ status: "expired" }));

    await expect(validateEarlyAccessCheckoutBeforeClaim(identity)).rejects.toThrow(
      /no longer active/,
    );
  });
});

describe("Early Access deferred binding behavior", () => {
  const input = {
    ...identity,
    userId: "44444444-4444-4444-8444-444444444444",
    subscriptionId: "sub_1",
  };

  it("does not rewrite a grant that was already redeemed", async () => {
    seed(grantRow({ status: "redeemed", shop_id: SHOP_ID }));

    await expect(deferEarlyAccessGrantShopBinding(input)).resolves.toBeUndefined();
    expect(updates()).toHaveLength(0);
  });

  it("records the pending owner on an active grant", async () => {
    seed(grantRow());

    await expect(deferEarlyAccessGrantShopBinding(input)).resolves.toBeUndefined();
    expect(updates()).toHaveLength(1);
    expect(updates()[0].payload).toMatchObject({
      metadata: { pending_user_id: input.userId, subscription_id: "sub_1" },
    });
  });
});

describe("Early Access approval link expiry behavior", () => {
  const token = "t".repeat(43);

  it("rejects an expired link without changing the grant so Ops can reissue it", async () => {
    seed(
      grantRow(
        {},
        {
          approval_expires_at: new Date(Date.now() - 1000).toISOString(),
          checkout_session_id: null,
        },
      ),
    );

    await expect(findEarlyAccessGrantByToken(token)).rejects.toThrow(/has expired/);
    expect(updates()).toHaveLength(0);
  });

  it("surfaces the stored Stripe customer on the grant contract", async () => {
    seed(grantRow());

    await expect(findEarlyAccessGrantByToken(token)).resolves.toMatchObject({
      grantId: GRANT_ID,
      stripeCustomerId: "cus_1",
      stripeCouponId: "coupon_1",
    });
  });

  it("reports no stored customer before checkout starts", async () => {
    seed(grantRow({}, { stripe_customer_id: "" }));

    await expect(findEarlyAccessGrantByToken(token)).resolves.toMatchObject({
      stripeCustomerId: null,
    });
  });
});
