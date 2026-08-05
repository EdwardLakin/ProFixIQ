import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { resolveShopBillingEntitlement } from "../features/stripe/lib/billing-entitlement";

const NOW = new Date("2026-08-05T20:00:00.000Z").getTime();
const read = (path: string) => readFileSync(path, "utf8");

describe("shop billing entitlement", () => {
  it("allows active, current trials, grace periods and internal demo shops", () => {
    expect(resolveShopBillingEntitlement({ stripeSubscriptionStatus: "active" }, NOW)).toMatchObject({ state: "active", canWrite: true });
    expect(resolveShopBillingEntitlement({ stripeSubscriptionStatus: "trialing", stripeTrialEnd: "2026-08-10T00:00:00.000Z" }, NOW)).toMatchObject({ state: "trialing", canWrite: true });
    expect(resolveShopBillingEntitlement({ stripeSubscriptionStatus: "past_due", billingGraceUntil: "2026-08-06T00:00:00.000Z" }, NOW)).toMatchObject({ state: "grace_period", canWrite: true });
    expect(resolveShopBillingEntitlement({ stripeSubscriptionStatus: "canceled", billingEntitlementOverride: "internal_demo" }, NOW)).toMatchObject({ state: "internal_demo", canWrite: true });
  });

  it("makes inactive, expired and explicitly suspended shops read-only", () => {
    for (const status of [null, "canceled", "unpaid", "incomplete_expired"]) {
      expect(resolveShopBillingEntitlement({ stripeSubscriptionStatus: status }, NOW)).toMatchObject({ state: "read_only", canWrite: false });
    }
    expect(resolveShopBillingEntitlement({ stripeSubscriptionStatus: "trialing", stripeTrialEnd: "2026-08-01T00:00:00.000Z" }, NOW)).toMatchObject({ state: "read_only", canWrite: false });
    expect(resolveShopBillingEntitlement({ stripeSubscriptionStatus: "active", billingEntitlementOverride: "suspended" }, NOW)).toMatchObject({ state: "suspended", canWrite: false });
  });

  it("gates authenticated staff API mutations while preserving recovery surfaces", () => {
    const middleware = read("middleware.ts");
    const gate = read("features/stripe/lib/server/enforce-middleware-entitlement.ts");

    expect(middleware).toContain('"/api/:path*"');
    expect(middleware).toContain("enforceApiWriteBillingEntitlement(req)");
    expect(gate).toContain('const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])');
    expect(gate).toContain('"/api/stripe/"');
    expect(gate).not.toContain('"/api/portal/"');
    expect(gate).not.toContain('"/api/public/"');
    expect(gate).toContain('code: "shop_billing_read_only"');
    expect(gate).toContain("status: 402");
  });

  it("removes unrestricted additional-shop insertion and marks seat drift", () => {
    const migration = read("supabase/migrations/20260806040000_shop_billing_entitlement_enforcement.sql");

    expect(migration).toContain("drop policy if exists shops_insert_authenticated");
    expect(migration).toContain("create policy shops_insert_first_shop_only");
    expect(migration).toContain("and p.shop_id is not null");
    expect(migration).toContain("stripe_billing_sync_required = true");
    expect(migration).toContain("profiles_mark_shop_billing_sync");
  });

  it("prevents authenticated clients from forging shop billing identity", () => {
    const initialProtection = read("supabase/migrations/20260806043000_protect_shop_billing_identity.sql");
    const reconciliation = read("supabase/migrations/20260806044500_reconcile_shop_billing_protection.sql");
    const generatedColumnFix = read("supabase/migrations/20260806045500_fix_generated_max_users_billing_guard.sql");

    expect(initialProtection).toContain("profixiq_protect_shop_billing_identity");
    expect(reconciliation).toContain("prevent_client_shop_billing_identity_write");
    expect(reconciliation).toContain("normalize_client_shop_billing_identity_insert");
    expect(reconciliation).toContain("new.billing_entitlement_override := null");
    expect(generatedColumnFix).toContain("max_users is a generated column");
    expect(generatedColumnFix).not.toContain("new.max_users is distinct from old.max_users");
    expect(generatedColumnFix).not.toContain("new.max_users := null");
  });

  it("creates additional locations read-only and bills each target shop separately", () => {
    const createLocation = read("app/api/organizations/locations/create/route.ts");
    const locationCheckout = read("app/api/organizations/locations/[shopId]/checkout/route.ts");

    expect(createLocation).toContain('billing_entitlement_override: "read_only"');
    expect(createLocation).toContain("organization_required");
    expect(createLocation).toContain("canManageBilling");
    expect(locationCheckout).toContain("currentShop.organization_id !== targetShop.organization_id");
    expect(locationCheckout).toContain("shop_id: targetShop.id");
    expect(locationCheckout).toContain("profixiq:location-checkout:");
  });
});
