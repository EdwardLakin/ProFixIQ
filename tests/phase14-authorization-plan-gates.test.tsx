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
import {
  getActorCapabilities,
  type ActorCapabilities,
  type CanonicalRole,
} from "@/features/shared/lib/rbac";
import { resolvePaymentAccessFailure } from "@/features/stripe/lib/client/paymentAccessFailure";

const CAPABILITY_KEYS = [
  "canManageUsers",
  "canManageWorkforce",
  "canAuthorizeQuotes",
  "canEditPricing",
  "canManageWorkOrders",
  "canPerformAssignedWork",
  "canAssignWork",
  "canManageParts",
  "canRunInspections",
  "canViewShopWideData",
  "canViewFinancials",
  "canManageScheduling",
  "canApproveTimeAway",
  "canReviewWorkforceTime",
  "canFinalizeWorkforceTime",
  "canManageFleetApprovals",
  "canViewFleetOnlyData",
  "canManageBranding",
  "canManageBilling",
  "canOverrideOperationalState",
  "canInvitePortalCustomers",
  "canManagePortalQr",
  "canInviteFleetMembers",
] as const satisfies readonly (keyof ActorCapabilities)[];

type CapabilityKey = (typeof CAPABILITY_KEYS)[number];

const OWNER_ADMIN_CAPABILITIES = CAPABILITY_KEYS.filter(
  (capability) =>
    capability !== "canManageFleetApprovals" &&
    capability !== "canViewFleetOnlyData",
);

const EXPECTED_ENABLED_CAPABILITIES = {
  owner: OWNER_ADMIN_CAPABILITIES,
  admin: OWNER_ADMIN_CAPABILITIES,
  manager: [
    "canManageWorkforce",
    "canAuthorizeQuotes",
    "canEditPricing",
    "canManageWorkOrders",
    "canPerformAssignedWork",
    "canAssignWork",
    "canManageParts",
    "canRunInspections",
    "canViewShopWideData",
    "canViewFinancials",
    "canManageScheduling",
    "canApproveTimeAway",
    "canReviewWorkforceTime",
    "canInvitePortalCustomers",
    "canManagePortalQr",
    "canInviteFleetMembers",
  ],
  advisor: [
    "canAuthorizeQuotes",
    "canManageWorkOrders",
    "canAssignWork",
    "canRunInspections",
    "canViewShopWideData",
    "canManageScheduling",
    "canInvitePortalCustomers",
  ],
  service: [
    "canAuthorizeQuotes",
    "canManageWorkOrders",
    "canRunInspections",
    "canInvitePortalCustomers",
  ],
  parts: ["canManageParts", "canViewShopWideData"],
  mechanic: ["canPerformAssignedWork", "canRunInspections"],
  lead_hand: [
    "canManageWorkOrders",
    "canPerformAssignedWork",
    "canAssignWork",
    "canManageParts",
    "canRunInspections",
    "canViewShopWideData",
    "canManageScheduling",
    "canInvitePortalCustomers",
  ],
  foreman: [
    "canAuthorizeQuotes",
    "canManageWorkOrders",
    "canPerformAssignedWork",
    "canAssignWork",
    "canManageParts",
    "canRunInspections",
    "canViewShopWideData",
    "canManageScheduling",
    "canInvitePortalCustomers",
  ],
  fleet_manager: ["canManageFleetApprovals", "canViewFleetOnlyData"],
  dispatcher: ["canManageFleetApprovals", "canViewFleetOnlyData"],
  driver: ["canViewFleetOnlyData"],
  customer: [],
  unknown: [],
} as const satisfies Record<CanonicalRole, readonly CapabilityKey[]>;

describe("Phase 14 canonical role matrix", () => {
  it.each(
    Object.entries(EXPECTED_ENABLED_CAPABILITIES) as Array<
      [CanonicalRole, readonly CapabilityKey[]]
    >,
  )("locks every capability for %s", (role, enabledCapabilities) => {
      const capabilities = getActorCapabilities({ role });
      const enabled = new Set<CapabilityKey>(enabledCapabilities);

      expect(capabilities.canonicalRole).toBe(role);
      expect(capabilities.isKnownRole).toBe(role !== "unknown");
      for (const capability of CAPABILITY_KEYS) {
        expect(capabilities[capability], `${role}.${capability}`).toBe(
          enabled.has(capability),
        );
      }
    });

  it("distinguishes PIN, expired-session, and revoked-role responses", () => {
    expect(resolvePaymentAccessFailure(401, "Owner PIN required")).toBe(
      "owner_pin",
    );
    expect(resolvePaymentAccessFailure(403, "Owner PIN purpose not allowed")).toBe(
      "owner_pin",
    );
    expect(resolvePaymentAccessFailure(401, "Not authenticated")).toBe(
      "authentication",
    );
    expect(resolvePaymentAccessFailure(403, "Forbidden")).toBe(
      "authorization",
    );
  });
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

  it("denies Stripe account creation before its provider and post-guard admin client", async () => {
    const denied = new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
    mocks.requireShopScopedApiAccess.mockResolvedValue({
      ok: false,
      response: denied,
    });
    const response = await startStripeOnboarding();

    expect(response).toBe(denied);
    expect(mocks.requireShopScopedApiAccess).toHaveBeenCalledWith({
      requiredCapability: "canManageBilling",
      allowRoles: ["owner", "admin"],
    });
    expect(mocks.createStripeClient).not.toHaveBeenCalled();
    expect(mocks.createAdminSupabase).not.toHaveBeenCalled();
  });
});
