import { beforeEach, describe, expect, it } from "vitest";
import { WORKSPACE_CAPABILITIES } from "@/features/workspace/authorization/capabilities";
import {
  clearWorkspaceAuthorizationSnapshot,
  normalizeWorkspaceCapabilities,
  persistWorkspaceAuthorizationSnapshot,
  readWorkspaceAuthorizationSnapshot,
} from "@/features/workspace/authorization/offlineWorkspaceAuthorization";

describe("offline Workspace authorization snapshot", () => {
  beforeEach(() => localStorage.clear());

  it("restores only a snapshot bound to the authenticated user and shop", () => {
    const capabilities = normalizeWorkspaceCapabilities({
      [WORKSPACE_CAPABILITIES.runWorkOrderInspections]: {
        granted: true,
        source: "shop_role_policy",
      },
    });

    persistWorkspaceAuthorizationSnapshot({
      actor: {
        userId: "user-a",
        profileId: "profile-a",
        shopId: "shop-a",
        role: "mechanic",
      },
      capabilities,
    });

    expect(
      readWorkspaceAuthorizationSnapshot({ userId: "user-a", shopId: "shop-a" }),
    ).toMatchObject({
      actor: { profileId: "profile-a", role: "mechanic" },
      capabilities: {
        [WORKSPACE_CAPABILITIES.runWorkOrderInspections]: {
          granted: true,
          source: "shop_role_policy",
        },
      },
    });
    expect(
      readWorkspaceAuthorizationSnapshot({ userId: "user-b", shopId: "shop-a" }),
    ).toBeNull();
    expect(
      readWorkspaceAuthorizationSnapshot({ userId: "user-a", shopId: "shop-b" }),
    ).toBeNull();
  });

  it("fails closed for unknown capability decisions and supports sign-out cleanup", () => {
    const capabilities = normalizeWorkspaceCapabilities({
      [WORKSPACE_CAPABILITIES.runWorkOrderInspections]: {
        granted: true,
        source: "unexpected",
      },
    });
    expect(
      capabilities[WORKSPACE_CAPABILITIES.runWorkOrderInspections],
    ).toMatchObject({ granted: false, source: "unavailable" });
    expect(
      capabilities[WORKSPACE_CAPABILITIES.manageTeamPermissions].granted,
    ).toBe(false);

    persistWorkspaceAuthorizationSnapshot({
      actor: {
        userId: "user-a",
        profileId: "profile-a",
        shopId: "shop-a",
        role: "mechanic",
      },
      capabilities,
    });
    clearWorkspaceAuthorizationSnapshot();
    expect(readWorkspaceAuthorizationSnapshot({ userId: "user-a" })).toBeNull();
  });
});
