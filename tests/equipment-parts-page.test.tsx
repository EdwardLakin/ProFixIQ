import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  role: "owner",
  entitlement: "enabled",
  load: vi.fn(),
  session: vi.fn(() => ({})),
  admin: vi.fn(() => ({})),
}));
vi.mock("next/cache", () => ({ unstable_noStore: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirect");
  },
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopPageAccess: async ({ allowRoles }: { allowRoles: string[] }) => {
    if (!allowRoles.includes(mocks.role)) throw new Error("denied");
    return {
      profile: { shop_id: "authenticated-shop" },
      canonicalRole: mocks.role,
    };
  },
}));
vi.mock("@/features/shared/lib/supabase/server", () => ({
  createServerSupabaseRSC: mocks.session,
  createAdminSupabase: mocks.admin,
}));
vi.mock("@/features/equipment/server/pageEntitlement", () => ({
  resolveEquipmentPageEntitlement: async () => mocks.entitlement,
}));
vi.mock("@/features/equipment/parts/server/loadEquipmentParts", () => ({
  loadEquipmentParts: mocks.load,
}));
import Page from "../app/equipment/parts/page";
beforeEach(() => {
  mocks.role = "owner";
  mocks.entitlement = "enabled";
  mocks.load.mockReset().mockResolvedValue([]);
  mocks.session.mockClear();
  mocks.admin.mockClear();
});
describe("Equipment Parts entry gates", () => {
  it.each(["owner", "admin", "manager", "parts"])(
    "uses authenticated scope for %s",
    async (role) => {
      mocks.role = role;
      await Page();
      expect(mocks.load).toHaveBeenCalledWith(
        expect.objectContaining({ shopId: "authenticated-shop", role }),
      );
    },
  );
  it.each(["lead_hand", "foreman"])(
    "explains narrower queue access to %s without data reads",
    async (role) => {
      mocks.role = role;
      expect((await Page()).props.restricted).toBe(true);
      expect(mocks.load).not.toHaveBeenCalled();
      expect(mocks.admin).not.toHaveBeenCalled();
      expect(mocks.session).not.toHaveBeenCalled();
      expect(mocks.admin).not.toHaveBeenCalled();
    },
  );
  it.each(["mechanic", "customer", "fleet_manager", "unknown"])(
    "denies %s",
    async (role) => {
      mocks.role = role;
      await expect(Page()).rejects.toThrow();
      expect(mocks.load).not.toHaveBeenCalled();
      expect(mocks.admin).not.toHaveBeenCalled();
    },
  );
  it.each(["disabled", "error"])(
    "fails closed on %s entitlement",
    async (entitlement) => {
      mocks.entitlement = entitlement;
      expect((await Page()).props.state).toBe(entitlement);
      expect(mocks.load).not.toHaveBeenCalled();
      expect(mocks.admin).not.toHaveBeenCalled();
    },
  );
  it("keeps failed reads distinct from empty queues", async () => {
    mocks.load.mockRejectedValue(new Error("private information"));
    expect((await Page()).props.error).toBe(true);
  });
});
