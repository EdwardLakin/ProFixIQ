import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildOwnerShopDirectoryRows,
  filterOwnerShopDirectoryRows,
  resolveOwnerShopPlan,
  type OwnerShopDirectoryOwner,
  type OwnerShopDirectoryProfile,
  type OwnerShopDirectoryShop,
} from "@/features/dashboard/lib/ownerShopDirectory";

function source(path: string): string {
  return readFileSync(path, "utf8").replaceAll("\r\n", "\n");
}

function shop(
  overrides: Partial<OwnerShopDirectoryShop> = {},
): OwnerShopDirectoryShop {
  return {
    id: "shop-prairie",
    name: "Prairie Fleet & Diesel Demo",
    city: "Calgary",
    province: "AB",
    email: "prairie@example.test",
    phone_number: "403-555-0100",
    timezone: "America/Edmonton",
    plan: "pro",
    owner_id: "owner-prairie",
    created_at: "2026-01-01T00:00:00.000Z",
    stripe_pricing_model: "product_packages_v1",
    subscription_package: "complete_operations",
    ...overrides,
  };
}

function shopProfile(
  overrides: Partial<OwnerShopDirectoryProfile> = {},
): OwnerShopDirectoryProfile {
  return {
    shop_id: "shop-prairie",
    city: "Calgary",
    province: "AB",
    email: "profile-prairie@example.test",
    phone: "403-555-0101",
    updated_at: "2026-08-22T00:00:00.000Z",
    ...overrides,
  };
}

function owner(
  overrides: Partial<OwnerShopDirectoryOwner> = {},
): OwnerShopDirectoryOwner {
  return {
    id: "owner-prairie",
    shop_id: "shop-prairie",
    full_name: "Prairie Owner",
    email: "owner@example.test",
    role: "owner",
    user_id: "auth-owner-prairie",
    ...overrides,
  };
}

describe("Phase 10 owner shop governance contract", () => {
  it("renders both tenant shops and uses current product-package plan labels", () => {
    const rows = buildOwnerShopDirectoryRows({
      shops: [
        shop(),
        shop({
          id: "shop-pro-fix",
          name: "PRO FIX",
          owner_id: "owner-pro-fix",
          plan: "starter",
          subscription_package: "shop_operations",
        }),
      ],
      shopProfiles: [shopProfile(), shopProfile({ shop_id: "shop-pro-fix" })],
      ownerProfiles: [
        owner(),
        owner({
          id: "owner-pro-fix",
          shop_id: "shop-pro-fix",
          full_name: "PRO FIX Owner",
        }),
      ],
      canViewBilling: true,
    });

    expect(rows.map((row) => row.name)).toEqual([
      "Prairie Fleet & Diesel Demo",
      "PRO FIX",
    ]);
    expect(rows.map((row) => row.plan.label)).toEqual([
      "Complete Operations",
      "Shop Operations",
    ]);
    expect(
      rows.every((row) => row.plan.source === "subscription_package"),
    ).toBe(true);
  });

  it("supports a real single-shop result without treating it as loading", () => {
    const rows = buildOwnerShopDirectoryRows({
      shops: [shop()],
      shopProfiles: [shopProfile()],
      ownerProfiles: [owner()],
      canViewBilling: true,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "shop-prairie",
      health: "Complete",
      ownerName: "Prairie Owner",
    });
  });

  it("does not disclose billing labels to an admin without owner access", () => {
    expect(resolveOwnerShopPlan(shop(), false)).toEqual({
      label: null,
      source: "restricted",
    });
  });

  it("reports missing profile fields as follow-up rather than dropping the shop", () => {
    const rows = buildOwnerShopDirectoryRows({
      shops: [shop()],
      shopProfiles: [shopProfile({ email: null })],
      ownerProfiles: [owner()],
      canViewBilling: true,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].health).toBe("Needs profile");
    expect(rows[0].email).toBe("prairie@example.test");
  });

  it("keeps primary shops visible when either secondary aggregation fails", () => {
    const rows = buildOwnerShopDirectoryRows({
      shops: [shop()],
      shopProfiles: null,
      ownerProfiles: null,
      canViewBilling: true,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      health: "Unavailable",
      profileHealthAvailable: false,
      ownerSummaryAvailable: false,
      ownerId: "owner-prairie",
    });
  });

  it("reflects billing-source changes and flags incomplete product billing sync", () => {
    expect(
      resolveOwnerShopPlan(
        shop({ subscription_package: "field_service" }),
        true,
      ),
    ).toMatchObject({ label: "Field Service", source: "subscription_package" });
    expect(
      resolveOwnerShopPlan(shop({ subscription_package: null }), true),
    ).toEqual({
      label: "Billing sync required",
      source: "billing_sync_required",
    });
    expect(
      resolveOwnerShopPlan(
        shop({
          stripe_pricing_model: "legacy",
          subscription_package: null,
          plan: "unlimited",
        }),
        true,
      ),
    ).toEqual({
      label: "ProFixIQ Unlimited",
      source: "legacy_billing_plan",
    });
  });

  it("searches normalized directory fields and filters each health state", () => {
    const rows = buildOwnerShopDirectoryRows({
      shops: [
        shop(),
        shop({ id: "shop-pro-fix", name: "PRO FIX", owner_id: "owner-2" }),
      ],
      shopProfiles: [
        shopProfile(),
        shopProfile({
          shop_id: "shop-pro-fix",
          city: "Denver",
          email: null,
        }),
      ],
      ownerProfiles: [
        owner(),
        owner({
          id: "owner-2",
          shop_id: "shop-pro-fix",
          full_name: "Starter Owner",
        }),
      ],
      canViewBilling: true,
    });

    expect(filterOwnerShopDirectoryRows(rows, "denVER", "all")).toHaveLength(1);
    expect(
      filterOwnerShopDirectoryRows(rows, "starter owner", "all"),
    ).toHaveLength(1);
    expect(filterOwnerShopDirectoryRows(rows, "", "Complete")).toHaveLength(1);
    expect(
      filterOwnerShopDirectoryRows(rows, "", "Needs profile"),
    ).toHaveLength(1);
  });

  it("locks tenant scoping, independent metrics, denial, and correlation in source", () => {
    const route = source("app/api/admin/shops/route.ts");
    const page = source("app/dashboard/admin/shops/page.tsx");
    const client = source(
      "features/dashboard/app/dashboard/admin/ShopsClient.tsx",
    );

    expect(route).toContain('allowRoles: ["owner", "admin"]');
    expect(route).toContain(
      '.eq("organization_id", currentShop.organization_id)',
    );
    expect(route).toContain('.in("owner_id", ownerIds)');
    expect(route).toContain("await Promise.allSettled([");
    expect(route).toContain('canViewBilling: access.canonicalRole === "owner"');
    expect(route).toContain('"X-Request-Id": requestId');
    expect(route).toContain('"Cache-Control": "private, no-store"');
    expect(page).toContain('allow: ["owner", "admin"]');
    expect(client).toContain('fetch("/api/admin/shops"');
    expect(client).not.toContain('from("shops")');
  });
});
