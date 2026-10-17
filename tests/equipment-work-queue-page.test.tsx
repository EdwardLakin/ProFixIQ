import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  role: "owner",
  entitlement: "enabled",
  load: vi.fn(),
  admin: vi.fn(() => ({})),
}));
vi.mock("next/cache", () => ({ unstable_noStore: vi.fn() }));
vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopPageAccess: async ({
    allowRoles,
  }: {
    allowRoles: readonly string[];
  }) => {
    if (!allowRoles.includes(mocks.role)) throw new Error("Denied");
    return { profile: { shop_id: "server-shop" }, canonicalRole: mocks.role };
  },
}));
vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: mocks.admin,
  createServerSupabaseRSC: () => ({}),
}));
vi.mock("@/features/equipment/server/pageEntitlement", () => ({
  resolveEquipmentPageEntitlement: async () => mocks.entitlement,
}));
vi.mock("@/features/equipment/server/loadEquipmentWorkQueue", () => ({
  loadEquipmentWorkQueue: mocks.load,
}));
import Page from "../app/equipment/work-orders/page";
import { EQUIPMENT_DIRECTORY_ROLES } from "@/features/equipment/lib/equipmentDirectory";
beforeEach(() => {
  mocks.role = "owner";
  mocks.entitlement = "enabled";
  mocks.load.mockReset().mockResolvedValue({ rows: [] });
  mocks.admin.mockClear();
});
describe("Equipment queue page authorization", () => {
  it.each(EQUIPMENT_DIRECTORY_ROLES)(
    "allows existing directory role %s with server-derived tenant scope",
    async (role) => {
      mocks.role = role;
      await Page({
        searchParams: Promise.resolve({
          shopId: "other-shop",
          q: "CAT",
          page: "2",
        }),
      });
      expect(mocks.load).toHaveBeenCalledWith(
        expect.objectContaining({
          shopId: "server-shop",
          role,
          filters: expect.objectContaining({ q: "CAT", page: 2 }),
        }),
      );
    },
  );
  it.each(["mechanic", "customer", "driver", "fleet_manager", "unknown"])(
    "denies %s before privileged reads",
    async (role) => {
      mocks.role = role;
      await expect(Page({})).rejects.toThrow("Denied");
      expect(mocks.admin).not.toHaveBeenCalled();
      expect(mocks.load).not.toHaveBeenCalled();
    },
  );
  it.each(["disabled", "error"])(
    "fails closed on entitlement %s",
    async (state) => {
      mocks.entitlement = state;
      const page = await Page({});
      expect(page.props.retryHref).toBe("/equipment/work-orders");
      expect(mocks.admin).not.toHaveBeenCalled();
      expect(mocks.load).not.toHaveBeenCalled();
    },
  );
});
