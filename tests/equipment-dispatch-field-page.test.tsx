import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  role: "mechanic",
  entitlement: "enabled",
  decision: "ready",
  field: vi.fn(),
  admin: vi.fn(),
}));
vi.mock("next/cache", () => ({ unstable_noStore: vi.fn() }));
vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopPageAccess: async (options: {
    allowRoles: string[];
    requiredCapability?: string;
  }) => {
    expect(options.requiredCapability).toBeUndefined();
    if (!options.allowRoles.includes(mocks.role)) throw new Error("Denied");
    return {
      profile: { id: "actor", shop_id: "shop" },
      canonicalRole: mocks.role,
    };
  },
}));
vi.mock("@/features/equipment/server/pageEntitlement", () => ({
  resolveEquipmentPageEntitlement: async () => mocks.entitlement,
}));
vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: mocks.admin,
  createServerSupabaseRSC: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "actor" } } }) },
  }),
}));
vi.mock("@/features/mobile/service/server/access", () => ({
  getMobileFieldServiceAccess: mocks.field,
}));
import Page from "../app/equipment/field/page";
import EquipmentPersonalAcknowledgements from "@/features/equipment/dispatch/server/EquipmentPersonalAcknowledgements";
beforeEach(() => {
  mocks.role = "mechanic";
  mocks.entitlement = "enabled";
  mocks.decision = "ready";
  mocks.admin.mockClear();
  mocks.field
    .mockReset()
    .mockImplementation(async () => ({
      decision: mocks.decision,
      canConfigure: false,
    }));
});
describe("technician-facing Equipment acknowledgement entry", () => {
  it("offers mechanics the personal receipt action without scheduling or directory capability", async () => {
    const page = await Page();
    expect(page.props.children.type).toBe(EquipmentPersonalAcknowledgements);
    expect(page.props.children.props).toEqual({
      shopId: "shop",
      actorId: "actor",
    });
    expect(mocks.field).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalRole: "mechanic",
        profile: { id: "actor", shop_id: "shop" },
      }),
    );
  });
  it.each(["forbidden", "setup_required", "plan_required"])(
    "does not mount reads before Field access: %s",
    async (decision) => {
      mocks.decision = decision;
      const page = await Page();
      expect(page.props.children).toBeNull();
      expect(mocks.admin).not.toHaveBeenCalled();
    },
  );
  it.each(["disabled", "error"])(
    "does not mount reads when entitlement is %s",
    async (state) => {
      mocks.entitlement = state;
      const page = await Page();
      expect(page.props.retryHref).toBe("/equipment/field");
      expect(mocks.field).not.toHaveBeenCalled();
      expect(mocks.admin).not.toHaveBeenCalled();
    },
  );
  it.each(["customer", "driver", "unknown"])(
    "denies %s before Field reads",
    async (role) => {
      mocks.role = role;
      await expect(Page()).rejects.toThrow("Denied");
      expect(mocks.field).not.toHaveBeenCalled();
      expect(mocks.admin).not.toHaveBeenCalled();
    },
  );
});
