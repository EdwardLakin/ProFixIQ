import { describe, expect, it, vi } from "vitest";
import { WORKSPACE_CAPABILITIES } from "@/features/workspace/authorization/capabilities";
import { resolveCurrentWorkspaceCapabilities } from "@/features/workspace/authorization/server/resolveWorkspaceCapabilities";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const SHOP_ID = "22222222-2222-4222-8222-222222222222";

describe("current Workspace capability resolver", () => {
  it("uses the server decision returned for the authenticated canonical profile", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          profile_id: PROFILE_ID,
          shop_id: SHOP_ID,
          canonical_role: "mechanic",
          capability_key: WORKSPACE_CAPABILITIES.manageWorkOrderAssignments,
          access_level: "manage",
          granted: true,
          decision_source: "individual_override",
        },
      ],
      error: null,
    });

    const result = await resolveCurrentWorkspaceCapabilities({
      supabase: { rpc },
      profileId: PROFILE_ID,
      shopId: SHOP_ID,
      capabilityKeys: [WORKSPACE_CAPABILITIES.manageWorkOrderAssignments],
    });

    expect(rpc).toHaveBeenCalledWith("workspace_current_actor_capabilities", {
      p_capability_keys: [
        WORKSPACE_CAPABILITIES.manageWorkOrderAssignments,
      ],
    });
    expect(result.error).toBeNull();
    expect(
      result.capabilities[WORKSPACE_CAPABILITIES.manageWorkOrderAssignments],
    ).toMatchObject({
      granted: true,
      source: "individual_override",
      accessLevel: "manage",
    });
  });

  it("fails closed when the RPC errors", async () => {
    const result = await resolveCurrentWorkspaceCapabilities({
      supabase: {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "database unavailable" },
        }),
      },
      profileId: PROFILE_ID,
      shopId: SHOP_ID,
      capabilityKeys: [WORKSPACE_CAPABILITIES.manageWorkOrderAssignments],
    });

    expect(result.error).toBe("database unavailable");
    expect(
      result.capabilities[WORKSPACE_CAPABILITIES.manageWorkOrderAssignments]
        .granted,
    ).toBe(false);
  });

  it("rejects a result for a different profile or tenant", async () => {
    const result = await resolveCurrentWorkspaceCapabilities({
      supabase: {
        rpc: vi.fn().mockResolvedValue({
          data: [
            {
              profile_id: "33333333-3333-4333-8333-333333333333",
              shop_id: SHOP_ID,
              canonical_role: "owner",
              capability_key:
                WORKSPACE_CAPABILITIES.manageWorkOrderAssignments,
              access_level: "manage",
              granted: true,
              decision_source: "profixiq_preset",
            },
          ],
          error: null,
        }),
      },
      profileId: PROFILE_ID,
      shopId: SHOP_ID,
      capabilityKeys: [WORKSPACE_CAPABILITIES.manageWorkOrderAssignments],
    });

    expect(result.error).toBe("Workspace authorization scope mismatch");
    expect(
      result.capabilities[WORKSPACE_CAPABILITIES.manageWorkOrderAssignments]
        .granted,
    ).toBe(false);
  });

  it("fails closed on an invalid decision shape", async () => {
    const result = await resolveCurrentWorkspaceCapabilities({
      supabase: {
        rpc: vi.fn().mockResolvedValue({
          data: [
            {
              profile_id: PROFILE_ID,
              shop_id: SHOP_ID,
              canonical_role: "manager",
              capability_key:
                WORKSPACE_CAPABILITIES.manageWorkOrderAssignments,
              access_level: "owner",
              granted: true,
              decision_source: "unexpected_source",
            },
          ],
          error: null,
        }),
      },
      profileId: PROFILE_ID,
      shopId: SHOP_ID,
      capabilityKeys: [WORKSPACE_CAPABILITIES.manageWorkOrderAssignments],
    });

    expect(result.error).toBe(
      "Workspace authorization returned an invalid decision",
    );
    expect(
      result.capabilities[WORKSPACE_CAPABILITIES.manageWorkOrderAssignments]
        .granted,
    ).toBe(false);
  });

  it("keeps an omitted decision denied", async () => {
    const result = await resolveCurrentWorkspaceCapabilities({
      supabase: {
        rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
      },
      profileId: PROFILE_ID,
      shopId: SHOP_ID,
      capabilityKeys: [WORKSPACE_CAPABILITIES.manageWorkOrderAssignments],
    });

    expect(result.error).toBeNull();
    expect(
      result.capabilities[WORKSPACE_CAPABILITIES.manageWorkOrderAssignments],
    ).toMatchObject({ granted: false, source: "unavailable" });
  });
});
