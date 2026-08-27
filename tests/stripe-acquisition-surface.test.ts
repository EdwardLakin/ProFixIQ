import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  readStripeAcquisitionMetadata,
  verifyStripeAcquisitionCheckout,
} from "../features/stripe/lib/server/stripe-acquisition-intent";

const BASE_METADATA = {
  purpose: "profixiq_acquisition",
  acquisition_intent_id: "11111111-1111-4111-8111-111111111111",
  acquisition_nonce: "a".repeat(64),
  plan_key: "starter",
  price_id: "price_surface123",
};

describe("Stripe acquisition product surface", () => {
  it.each([
    ["shop_operations", "shop"],
    ["field_service", "field"],
    ["fleet_maintenance", "fleet"],
    ["complete_operations", "shop"],
  ] as const)(
    "derives %s account setup from server-owned package metadata",
    (packageKey, surface) => {
      expect(
        readStripeAcquisitionMetadata({
          ...BASE_METADATA,
          package_key: packageKey,
        }),
      ).toMatchObject({ packageKey, surface });
    },
  );

  it("accepts an explicit surface only when it matches the package", () => {
    expect(
      readStripeAcquisitionMetadata({
        ...BASE_METADATA,
        package_key: "field_service",
        acquisition_surface: "field",
      }),
    ).toMatchObject({ packageKey: "field_service", surface: "field" });

    expect(
      readStripeAcquisitionMetadata({
        ...BASE_METADATA,
        package_key: "field_service",
        acquisition_surface: "shop",
      }),
    ).toBeNull();
  });

  it("keeps legacy plan-only trial sessions on the Shop path", () => {
    expect(readStripeAcquisitionMetadata(BASE_METADATA)).toMatchObject({
      packageKey: null,
      surface: "shop",
    });
  });

  it("fails closed on unknown package identity", () => {
    expect(
      readStripeAcquisitionMetadata({
        ...BASE_METADATA,
        package_key: "unknown_product",
      }),
    ).toBeNull();
  });

  it("verifies completion, one matching price, email, and an access-bearing subscription", async () => {
    const session = {
      id: "cs_verified",
      mode: "subscription",
      status: "complete",
      payment_status: "paid",
      customer: { id: "cus_verified", email: "BUYER@example.com" },
      customer_details: null,
      subscription: { id: "sub_verified", status: "active" },
      metadata: {
        ...BASE_METADATA,
        package_key: "field_service",
        acquisition_surface: "field",
      },
    };
    const listLineItems = vi.fn().mockResolvedValue({
      data: [{ quantity: 1, price: { id: BASE_METADATA.price_id } }],
    });
    const stripe = {
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue(session),
          listLineItems,
        },
      },
      customers: { retrieve: vi.fn() },
      subscriptions: { retrieve: vi.fn() },
    } as unknown as Parameters<typeof verifyStripeAcquisitionCheckout>[0];

    await expect(
      verifyStripeAcquisitionCheckout(stripe, session.id),
    ).resolves.toMatchObject({
      email: "buyer@example.com",
      metadata: { packageKey: "field_service", surface: "field" },
      subscription: { id: "sub_verified", status: "active" },
    });

    listLineItems.mockResolvedValueOnce({
      data: [{ quantity: 1, price: { id: "price_wrong" } }],
    });
    await expect(
      verifyStripeAcquisitionCheckout(stripe, session.id),
    ).resolves.toBeNull();
  });
});
