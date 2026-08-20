import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveAuthenticatedStaffProfileMock = vi.hoisted(() => vi.fn());
const resolveCurrentWorkspaceCapabilitiesMock = vi.hoisted(() => vi.fn());
const createAdminSupabaseMock = vi.hoisted(() => vi.fn());

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  resolveAuthenticatedStaffProfile: resolveAuthenticatedStaffProfileMock,
}));

vi.mock(
  "@/features/workspace/authorization/server/resolveWorkspaceCapabilities",
  () => ({
    resolveCurrentWorkspaceCapabilities:
      resolveCurrentWorkspaceCapabilitiesMock,
  }),
);

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: createAdminSupabaseMock,
  createServerSupabaseRoute: vi.fn(),
}));

import { requireShopAssistantActor } from "@/features/shop-assistant/server/requireShopAssistantActor";
import { WORKSPACE_CAPABILITIES } from "@/features/workspace/authorization/capabilities";

const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
const PROFILE_ID = "22222222-2222-4222-8222-222222222222";
const SHOP_ID = "33333333-3333-4333-8333-333333333333";

function userClient() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: AUTH_USER_ID } },
        error: null,
      }),
    },
  };
}

function capabilityResult(granted: boolean, error: string | null = null) {
  return {
    capabilities: {
      [WORKSPACE_CAPABILITIES.manageTeamPermissions]: {
        capabilityKey: WORKSPACE_CAPABILITIES.manageTeamPermissions,
        accessLevel: "manage",
        granted: false,
        source: "unavailable",
      },
      [WORKSPACE_CAPABILITIES.manageWorkOrderAssignments]: {
        capabilityKey: WORKSPACE_CAPABILITIES.manageWorkOrderAssignments,
        accessLevel: "manage",
        granted,
        source: error ? "unavailable" : "individual_override",
      },
    },
    error,
  };
}

describe("Shop Assistant Workspace authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAdminSupabaseMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    });
  });

  it("allows a mechanic assignment tool only when the effective override allows it", async () => {
    resolveAuthenticatedStaffProfileMock.mockResolvedValue({
      profile: {
        id: PROFILE_ID,
        user_id: AUTH_USER_ID,
        shop_id: SHOP_ID,
        role: "mechanic",
      },
      error: null,
    });
    resolveCurrentWorkspaceCapabilitiesMock.mockResolvedValue(
      capabilityResult(true),
    );

    const actor = await requireShopAssistantActor(userClient() as never);

    expect(resolveCurrentWorkspaceCapabilitiesMock).toHaveBeenCalledWith({
      supabase: expect.anything(),
      profileId: PROFILE_ID,
      shopId: SHOP_ID,
      capabilityKeys: [WORKSPACE_CAPABILITIES.manageWorkOrderAssignments],
    });
    expect(actor.canonicalRole).toBe("mechanic");
    expect(actor.capabilities.canAssignWork).toBe(true);
    expect(actor.capabilities.canManageWorkOrders).toBe(false);
  });

  it("fails assignment closed when the effective resolver is unavailable", async () => {
    resolveAuthenticatedStaffProfileMock.mockResolvedValue({
      profile: {
        id: PROFILE_ID,
        user_id: AUTH_USER_ID,
        shop_id: SHOP_ID,
        role: "manager",
      },
      error: null,
    });
    resolveCurrentWorkspaceCapabilitiesMock.mockResolvedValue(
      capabilityResult(false, "database unavailable"),
    );

    const actor = await requireShopAssistantActor(userClient() as never);

    expect(actor.capabilities.canAssignWork).toBe(false);
    expect(actor.capabilities.canManageWorkOrders).toBe(true);
  });
});
