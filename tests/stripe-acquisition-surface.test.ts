import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readStripeAcquisitionMetadata } from "../features/stripe/lib/server/stripe-acquisition-intent";

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
});
