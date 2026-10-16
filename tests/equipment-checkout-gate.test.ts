import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isPackagePubliclyPurchasable } from "@/features/stripe/lib/server/package-checkout-availability";
import { PRODUCT_PACKAGE_KEYS } from "@/features/stripe/lib/stripe/product-packages";

describe("launch-gated package checkout", () => {
  it("keeps Equipment Operations closed unless the launch flag is true", () => {
    expect(isPackagePubliclyPurchasable("equipment_operations", {})).toBe(false);
    expect(
      isPackagePubliclyPurchasable("equipment_operations", {
        PROFIXIQ_EQUIPMENT_CHECKOUT_ENABLED: "false",
      }),
    ).toBe(false);
    expect(
      isPackagePubliclyPurchasable("equipment_operations", {
        PROFIXIQ_EQUIPMENT_CHECKOUT_ENABLED: "yes",
      }),
    ).toBe(false);
    expect(
      isPackagePubliclyPurchasable("equipment_operations", {
        PROFIXIQ_EQUIPMENT_CHECKOUT_ENABLED: " TRUE ",
      }),
    ).toBe(true);
  });

  it("leaves every existing package purchasable regardless of flags", () => {
    for (const key of PRODUCT_PACKAGE_KEYS.filter((k) => k !== "equipment_operations")) {
      expect(isPackagePubliclyPurchasable(key, {})).toBe(true);
    }
  });

  it("is enforced by the checkout request schema", () => {
    const route = readFileSync("app/api/stripe/checkout/route.ts", "utf8");
    expect(route).toContain("isPackagePubliclyPurchasable(value.packageKey)");
    expect(route).toContain("not available yet");
  });
});
