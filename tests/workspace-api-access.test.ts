import { beforeEach, describe, expect, it, vi } from "vitest";

const createServerSupabaseRouteMock = vi.hoisted(() => vi.fn());
const resolveCanonicalStaffProfileMock = vi.hoisted(() => vi.fn());
const resolveCurrentWorkspaceCapabilitiesMock = vi.hoisted(() => vi.fn());

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: vi.fn(),
  createServerSupabaseRSC: vi.fn(),
  createServerSupabaseRoute: createServerSupabaseRouteMock,
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

import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
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

describe("shop-scoped API Workspace capability enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createServerSupabaseRouteMock.mockReturnValue({
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

  it("allows an individually authorized mechanic", async () => {
    resolveCurrentWorkspaceCapabilitiesMock.mockResolvedValue(
      capabilityResult(true),
    );

    const result = await requireShopScopedApiAccess({
      requiredWorkspaceCapability:
        WORKSPACE_CAPABILITIES.manageWorkOrderAssignments,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile.id).toBe(PROFILE_ID);
      expect(result.profile.shop_id).toBe(SHOP_ID);
    }
  });

  it("returns 403 when the effective capability is denied", async () => {
    resolveCurrentWorkspaceCapabilitiesMock.mockResolvedValue(
      capabilityResult(false),
    );

    const result = await requireShopScopedApiAccess({
      requiredWorkspaceCapability:
        WORKSPACE_CAPABILITIES.manageWorkOrderAssignments,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("returns 503 instead of falling back to the static role on resolver errors", async () => {
    resolveCanonicalStaffProfileMock.mockResolvedValue({
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

    const result = await requireShopScopedApiAccess({
      requiredWorkspaceCapability:
        WORKSPACE_CAPABILITIES.manageWorkOrderAssignments,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(503);
  });
});
