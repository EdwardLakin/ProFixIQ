import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireShopPageAccess: vi.fn(),
  requireShopScopedApiAccess: vi.fn(),
  createStripeClient: vi.fn(),
  createAdminSupabase: vi.fn(),
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopPageAccess: mocks.requireShopPageAccess,
  requireShopScopedApiAccess: mocks.requireShopScopedApiAccess,
}));

vi.mock("@/features/shared/lib/server/owner-pin", () => ({
  OWNER_PIN_PURPOSES: {
    BILLING: "billing",
    PRIVILEGED: "privileged",
  },
}));

vi.mock("@/features/stripe/lib/stripe/client", () => ({
  createStripeClient: mocks.createStripeClient,
}));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: mocks.createAdminSupabase,
}));

vi.mock("@/features/stripe/lib/server/shop-payment-settings", () => ({
  saveShopPaymentSettings: vi.fn(),
}));

import { POST as startStripeOnboarding } from "../app/api/stripe/connect/onboard/route";
import OwnerBrandingLayout from "../app/dashboard/owner/branding/layout";
import OwnerCustomerImportLayout from "../app/dashboard/owner/import-customers/layout";
import OwnerPaymentsLayout from "../app/dashboard/owner/payments/layout";
import { getActorCapabilities } from "@/features/shared/lib/rbac";

describe("Phase 14 canonical role matrix", () => {
  it.each([
    [
      "owner",
      ["canManageUsers", "canManageBilling", "canManageWorkOrders"],
      [],
    ],
    [
      "admin",
      ["canManageUsers", "canManageBilling", "canManageWorkOrders"],
      [],
    ],
    [
      "manager",
      ["canManageWorkforce", "canViewFinancials", "canManageWorkOrders"],
      ["canManageUsers", "canManageBilling"],
    ],
    [
      "advisor",
      ["canManageWorkOrders", "canAuthorizeQuotes", "canInvitePortalCustomers"],
      [
        "canManageUsers",
        "canManageParts",
        "canViewFinancials",
        "canManageBilling",
      ],
    ],
    [
      "mechanic",
      ["canPerformAssignedWork", "canRunInspections"],
      ["canManageWorkOrders", "canViewShopWideData", "canViewFinancials"],
    ],
    [
      "lead_hand",
      ["canPerformAssignedWork", "canAssignWork", "canManageParts"],
      ["canAuthorizeQuotes", "canManageUsers", "canManageBilling"],
    ],
    [
      "parts",
      ["canManageParts", "canViewShopWideData"],
      ["canManageWorkOrders", "canManageWorkforce", "canManageBilling"],
    ],
    [
      "fleet_manager",
      ["canManageFleetApprovals", "canViewFleetOnlyData"],
      ["canManageUsers", "canManageBilling", "canManageWorkOrders"],
    ],
    [
      "dispatcher",
      ["canManageFleetApprovals", "canViewFleetOnlyData"],
      ["canManageUsers", "canManageBilling", "canManageWorkOrders"],
    ],
    [
      "driver",
      ["canViewFleetOnlyData"],
      ["canManageFleetApprovals", "canManageUsers", "canManageWorkOrders"],
    ],
    [
      "customer",
      [],
      ["canViewFleetOnlyData", "canManageUsers", "canManageWorkOrders"],
    ],
  ])(
    "keeps %s inside its allowed capability boundary",
    (role, allowed, denied) => {
      const capabilities = getActorCapabilities({ role });

      for (const capability of allowed) {
        expect(capabilities[capability as keyof typeof capabilities]).toBe(
          true,
        );
      }
      for (const capability of denied) {
        expect(capabilities[capability as keyof typeof capabilities]).toBe(
          false,
        );
      }
    },
  );
});

describe("Phase 14 owner governance boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireShopPageAccess.mockResolvedValue({
      profile: { id: "profile", shop_id: "shop" },
      canonicalRole: "owner",
    });
  });

  it.each([
    [
      "branding",
      OwnerBrandingLayout,
      {
        allowRoles: ["owner", "admin"],
        requiredCapability: "canManageBranding",
      },
    ],
    [
      "customer import",
      OwnerCustomerImportLayout,
      { allowRoles: ["owner", "admin"] },
    ],
    [
      "payments",
      OwnerPaymentsLayout,
      {
        allowRoles: ["owner", "admin"],
        requiredCapability: "canManageBilling",
      },
    ],
  ])(
    "server-gates the %s page before rendering",
    async (_name, Layout, expectedGate) => {
      const content = await Layout({ children: "sensitive owner content" });

      expect(content).toBe("sensitive owner content");
      expect(mocks.requireShopPageAccess).toHaveBeenCalledOnce();
      expect(mocks.requireShopPageAccess).toHaveBeenCalledWith(expectedGate);
    },
  );

  it("denies Stripe account creation before any provider or service-role call", async () => {
    const denied = new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
    mocks.requireShopScopedApiAccess.mockResolvedValue({
      ok: false,
      response: denied,
    });
    const request = new Request(
      "https://profixiq.test/api/stripe/connect/onboard",
      {
        method: "POST",
      },
    );

    const response = await startStripeOnboarding(request);

    expect(response).toBe(denied);
    expect(mocks.requireShopScopedApiAccess).toHaveBeenCalledWith({
      requiredCapability: "canManageBilling",
      allowRoles: ["owner", "admin"],
      requireOwnerPin: true,
      ownerPinRequest: request,
      ownerPinAllowedPurposes: ["billing", "privileged"],
    });
    expect(mocks.createStripeClient).not.toHaveBeenCalled();
    expect(mocks.createAdminSupabase).not.toHaveBeenCalled();
  });
});
