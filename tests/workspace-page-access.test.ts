import { beforeEach, describe, expect, it, vi } from "vitest";

const createServerSupabaseRSCMock = vi.hoisted(() => vi.fn());
const resolveCanonicalStaffProfileMock = vi.hoisted(() => vi.fn());
const resolveCurrentWorkspaceCapabilitiesMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() =>
  vi.fn((path: string): never => {
    throw new Error(`redirect:${path}`);
  }),
);

vi.mock("next/navigation", () => ({ redirect: redirectMock }));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: vi.fn(),
  createServerSupabaseRSC: createServerSupabaseRSCMock,
  createServerSupabaseRoute: vi.fn(),
}));

vi.mock("@/features/shared/lib/authenticated-profile", () => ({
  resolveCanonicalStaffProfile: resolveCanonicalStaffProfileMock,
}));

vi.mock(
  "@/features/workspace/authorization/server/resolveWorkspaceCapabilities",
  () => ({
    resolveCurrentWorkspaceCapabilities:
      resolveCurrentWorkspaceCapabilitiesMock,
  }),
);

import { ROLE_GROUPS } from "@/features/shared/lib/rbac";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import {
  WORKSPACE_CAPABILITIES,
  createDeniedWorkspaceCapabilities,
} from "@/features/workspace/authorization/capabilities";

const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
const PROFILE_ID = "22222222-2222-4222-8222-222222222222";
const SHOP_ID = "33333333-3333-4333-8333-333333333333";

function capabilityResult(granted: boolean, error: string | null = null) {
  const capabilities = createDeniedWorkspaceCapabilities();
  capabilities[WORKSPACE_CAPABILITIES.manageWorkOrderAssignments] = {
    capabilityKey: WORKSPACE_CAPABILITIES.manageWorkOrderAssignments,
    accessLevel: "manage",
    granted,
    source: error ? "unavailable" : "individual_override",
  };
  return { capabilities, error };
}

async function requireWorkOrderListAccess() {
  return requireShopPageAccess({
    allowRoles: ROLE_GROUPS.shopWideOperators,
    allowRolesOrWorkspaceCapability:
      WORKSPACE_CAPABILITIES.manageWorkOrderAssignments,
  });
}

describe("shop page role-or-Workspace capability enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createServerSupabaseRSCMock.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: AUTH_USER_ID } },
          error: null,
        }),
      },
    });
    resolveCanonicalStaffProfileMock.mockResolvedValue({
      profile: {
        id: PROFILE_ID,
        user_id: AUTH_USER_ID,
        shop_id: SHOP_ID,
        role: "mechanic",
      },
      error: null,
    });
  });

  it("allows a delegated mechanic into the shop work-order list", async () => {
    resolveCurrentWorkspaceCapabilitiesMock.mockResolvedValue(
      capabilityResult(true),
    );

    const result = await requireWorkOrderListAccess();

    expect(result.profile.id).toBe(PROFILE_ID);
    expect(result.canonicalRole).toBe("mechanic");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("keeps an ordinary mechanic out when the capability is denied", async () => {
    resolveCurrentWorkspaceCapabilitiesMock.mockResolvedValue(
      capabilityResult(false),
    );

    await expect(requireWorkOrderListAccess()).rejects.toThrow(
      "redirect:/dashboard",
    );
  });

  it("fails a role-alternative resolver error closed", async () => {
    resolveCurrentWorkspaceCapabilitiesMock.mockResolvedValue(
      capabilityResult(false, "database unavailable"),
    );

    await expect(requireWorkOrderListAccess()).rejects.toThrow(
      "redirect:/dashboard",
    );
  });

  it("does not make existing shop-wide roles depend on the new resolver", async () => {
    resolveCanonicalStaffProfileMock.mockResolvedValue({
      profile: {
        id: PROFILE_ID,
        user_id: AUTH_USER_ID,
        shop_id: SHOP_ID,
        role: "manager",
      },
      error: null,
    });

    const result = await requireWorkOrderListAccess();

    expect(result.canonicalRole).toBe("manager");
    expect(resolveCurrentWorkspaceCapabilitiesMock).not.toHaveBeenCalled();
  });
});
