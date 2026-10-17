import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getActorCapabilities,
  type CanonicalRole,
} from "@/features/shared/lib/rbac";
const mocks = vi.hoisted(() => ({
  field: vi.fn(),
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
  createServerSupabaseRSC: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "auth-actor" } } }) },
  }),
}));
vi.mock("@/features/equipment/server/pageEntitlement", () => ({
  resolveEquipmentPageEntitlement: async () => mocks.entitlement,
}));
vi.mock("@/features/equipment/dispatch/server/loadEquipmentDispatch", () => ({
  loadEquipmentDispatch: mocks.load,
}));
vi.mock("@/features/mobile/service/server/access", () => ({
  getMobileFieldServiceAccess: mocks.field,
}));
import Page from "../app/equipment/dispatch/page";
beforeEach(() => {
  mocks.field.mockReset().mockResolvedValue({ decision: "ready" });
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
  it.each(["ready", "forbidden", "setup_required", "plan_required"])(
    "uses canonical actor Field decision %s without blocking board reads",
    async (decision) => {
      mocks.field.mockResolvedValue({ decision });
      const result = await Page({});
      expect(result.props.dispatchAccess).toBe(decision);
      expect(result.props.data).toBeDefined();
      expect(mocks.load).toHaveBeenCalledOnce();
      expect(mocks.field).toHaveBeenCalledWith(
        expect.objectContaining({
          authUserId: "auth-actor",
          profile: { id: "server-actor", shop_id: "server-shop" },
          canonicalRole: "owner",
        }),
      );
    },
  );
  it("fails closed for dispatch controls when Field access cannot be read, retaining the board", async () => {
    mocks.field.mockRejectedValue(new Error("Field lookup failed"));
    const result = await Page({});
    expect(result.props.dispatchAccess).toBe("unavailable");
    expect(result.props.data).toBeDefined();
  });
  it("renders failure as failure, never an empty successful board", async () => {
    mocks.load.mockRejectedValue(new Error("private details"));
    const result = await Page({});
    expect(result.props.error).toBe(true);
    expect(result.props.data).toBeUndefined();
  });
});
