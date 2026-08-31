import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

import {
  acquisitionSurfaceProductCapabilities,
  resolveShopProductAccess,
} from "@/features/shared/lib/product-access";

const SHOP_ID = "33333333-3333-4333-8333-333333333333";

describe("Shop product access boundary", () => {
  it("delegates package, status, grace, and override decisions to the canonical RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });

    await expect(
      resolveShopProductAccess({
        supabase: { rpc } as never,
        shopId: SHOP_ID,
        capabilities: ["shop"],
      }),
    ).resolves.toEqual({ entitled: true, error: null });

    expect(rpc).toHaveBeenCalledWith("profixiq_shop_has_product_access", {
      p_capability: "shop",
      p_shop_id: SHOP_ID,
    });
  });

  it("fails closed when the entitlement RPC fails", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "temporary database failure" },
    });

    await expect(
      resolveShopProductAccess({
        supabase: { rpc } as never,
        shopId: SHOP_ID,
        capabilities: ["shop"],
      }),
    ).resolves.toEqual({
      entitled: false,
      error: "temporary database failure",
    });
  });

  it("keeps acquisition surfaces bound to their own canonical product", () => {
    expect(acquisitionSurfaceProductCapabilities("shop")).toEqual(["shop"]);
    expect(acquisitionSurfaceProductCapabilities("field")).toEqual([
      "field_service",
    ]);
    expect(acquisitionSurfaceProductCapabilities("fleet")).toEqual([
      "fleet_maintenance",
    ]);
  });

  it("keeps the established past-due, grace, legacy, and override contract canonical", () => {
    const migration = readFileSync(
      "supabase/migrations/20260811202000_scope_product_entitlement_rpcs.sql",
      "utf8",
    );
    const applicationGuard = readFileSync(
      "features/shared/lib/product-access.ts",
      "utf8",
    );

    expect(migration).toContain("('trialing', 'active', 'past_due')");
    expect(migration).toContain("billing_grace_until > now()");
    expect(migration).toContain(
      "billing_entitlement_override in ('active', 'internal_demo')",
    );
    expect(migration).toContain(
      "billing_entitlement_override in ('read_only', 'suspended')",
    );
    expect(migration).toContain(
      "subscription_package is null\n        and shop.stripe_pricing_model <> 'product_packages_v1'",
    );
    expect(applicationGuard).not.toContain("past_due");
    expect(applicationGuard).not.toContain("billing_grace_until");
  });

  it("enforces Shop at sign-in, navigation, page, and API boundaries", () => {
    const signInRoute = readFileSync("app/api/auth/sign-in/route.ts", "utf8");
    const middleware = readFileSync("middleware.ts", "utf8");
    const serverAccess = readFileSync(
      "features/shared/lib/server/admin-access.ts",
      "utf8",
    );
    const fieldAccess = readFileSync(
      "features/mobile/service/server/access.ts",
      "utf8",
    );

    expect(signInRoute).toContain(
      'surface === "shop" || surface === "mobile"',
    );
    expect(signInRoute).toContain(
      "capabilities: SHOP_PRODUCT_CAPABILITIES",
    );
    expect(middleware).toContain("shopProductAccessResolved");
    expect(middleware).toContain("shopProductEntitled");
    expect(middleware).toContain("isShopProductRoute");
    expect(serverAccess).toContain(
      "options.requiredProductCapabilities ?? SHOP_PRODUCT_CAPABILITIES",
    );
    expect(serverAccess).toContain('{ error: "Product access required" }');
    expect(fieldAccess).toContain(
      "requiredProductCapabilities: FIELD_PRODUCT_CAPABILITIES",
    );
  });
});
