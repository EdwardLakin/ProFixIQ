import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getActorCapabilities,
  type CanonicalRole,
} from "@/features/shared/lib/rbac";
const mocks = vi.hoisted(() => ({
  role: "owner",
  entitlement: "enabled",
  load: vi.fn(),
  admin: vi.fn(() => ({})),
}));
vi.mock("next/cache", () => ({ unstable_noStore: vi.fn() }));
vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopPageAccess: async (options: {
    allowRoles: string[];
    requiredCapability: string;
  }) => {
    expect(options.requiredCapability).toBe("canManageScheduling");
    if (
      !options.allowRoles.includes(mocks.role) ||
      !getActorCapabilities({ role: mocks.role as CanonicalRole })
        .canManageScheduling
    )
      throw new Error("Denied");
    return {
      profile: { shop_id: "server-shop", id: "server-actor" },
      canonicalRole: mocks.role,
    };
  },
}));
vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: mocks.admin,
  createServerSupabaseRSC: () => ({}),
}));
vi.mock("@/features/equipment/server/pageEntitlement", () => ({
  resolveEquipmentPageEntitlement: async () => mocks.entitlement,
}));
vi.mock("@/features/equipment/dispatch/server/loadEquipmentDispatch", () => ({
  loadEquipmentDispatch: mocks.load,
}));
import Page from "../app/equipment/dispatch/page";
beforeEach(() => {
  mocks.role = "owner";
  mocks.entitlement = "enabled";
  mocks.load.mockReset().mockResolvedValue({});
  mocks.admin.mockClear();
});
describe("Equipment Dispatch page access", () => {
  it.each([
    "owner",
    "admin",
    "manager",
    "advisor",
    "service",
    "lead_hand",
    "foreman",
  ])("preserves scheduling capability for %s", async (role) => {
    mocks.role = role;
    if (
      !getActorCapabilities({ role: role as CanonicalRole }).canManageScheduling
    ) {
      await expect(Page({})).rejects.toThrow("Denied");
      expect(mocks.admin).not.toHaveBeenCalled();
      return;
    }
    await Page({
      searchParams: Promise.resolve({
        shopId: "other",
        actorId: "forged",
        asset: "asset",
        page: "2",
      }),
    });
    expect(mocks.load).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: "server-shop",
        actorUserId: "server-actor",
        role,
        filters: expect.objectContaining({ asset: "asset", page: 2 }),
      }),
    );
  });
  it.each([
    "parts",
    "mechanic",
    "customer",
    "driver",
    "fleet_manager",
    "unknown",
  ])("denies %s before reads", async (role) => {
    mocks.role = role;
    await expect(Page({})).rejects.toThrow("Denied");
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it.each(["disabled", "error"])(
    "fails closed for entitlement %s",
    async (state) => {
      mocks.entitlement = state;
      const result = await Page({});
      expect(result.props.retryHref).toBe("/equipment/dispatch");
      expect(mocks.admin).not.toHaveBeenCalled();
    },
  );
  it("renders failure as failure, never an empty successful board", async () => {
    mocks.load.mockRejectedValue(new Error("private details"));
    const result = await Page({});
    expect(result.props.error).toBe(true);
    expect(result.props.data).toBeUndefined();
  });
});
