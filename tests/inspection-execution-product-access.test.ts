import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminSupabase: vi.fn(),
  resolveCanonicalStaffProfile: vi.fn(),
  resolveShopProductAccess: vi.fn(),
  resolveWorkOrderProductAuthority: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/shared/lib/authenticated-profile", () => ({
  resolveCanonicalStaffProfile: mocks.resolveCanonicalStaffProfile,
}));
vi.mock("@/features/shared/lib/product-access", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/features/shared/lib/product-access")
  >()),
  resolveShopProductAccess: mocks.resolveShopProductAccess,
}));
vi.mock("@/features/mobile/service/server/access", () => ({
  resolveWorkOrderProductAuthority: mocks.resolveWorkOrderProductAuthority,
}));
vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: mocks.createAdminSupabase,
}));

function supabaseWithUser(userId = "auth-user-1") {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      }),
    },
  };
}

describe("inspection execution product access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminSupabase.mockReturnValue({ from: vi.fn() });
    mocks.resolveCanonicalStaffProfile.mockResolvedValue({
      profile: {
        id: "profile-1",
        user_id: "auth-user-1",
        shop_id: "shop-1",
        role: "mechanic",
      },
      error: null,
    });
    mocks.resolveWorkOrderProductAuthority.mockResolvedValue({
      authorized: true,
      product: "field",
    });
    mocks.resolveShopProductAccess.mockResolvedValue({
      entitled: true,
      error: null,
    });
  });

  it("allows a Field inspection only through the exact linked Work Order authority", async () => {
    const { canExecuteInspectionForProduct } =
      await import("@/features/inspections/server/inspectionExecutionProductAccess");
    const supabase = supabaseWithUser();

    await expect(
      canExecuteInspectionForProduct({
        supabase: supabase as never,
        shopId: "shop-1",
        workOrderId: "wo-linked",
      }),
    ).resolves.toBe(true);

    expect(mocks.resolveWorkOrderProductAuthority).toHaveBeenCalledWith(
      expect.objectContaining({
        authUserId: "auth-user-1",
        profile: expect.objectContaining({
          id: "profile-1",
          shop_id: "shop-1",
        }),
      }),
      "wo-linked",
    );
  });

  it("denies an unrelated Field Work Order", async () => {
    mocks.resolveWorkOrderProductAuthority.mockResolvedValue({
      authorized: false,
      product: null,
    });
    const { canExecuteInspectionForProduct } =
      await import("@/features/inspections/server/inspectionExecutionProductAccess");

    await expect(
      canExecuteInspectionForProduct({
        supabase: supabaseWithUser() as never,
        shopId: "shop-1",
        workOrderId: "wo-unrelated",
      }),
    ).resolves.toBe(false);
  });

  it("keeps legacy standalone inspections Shop-only", async () => {
    const { canExecuteInspectionForProduct } =
      await import("@/features/inspections/server/inspectionExecutionProductAccess");

    await expect(
      canExecuteInspectionForProduct({
        supabase: supabaseWithUser() as never,
        shopId: "shop-1",
        workOrderId: null,
      }),
    ).resolves.toBe(true);

    mocks.resolveShopProductAccess.mockResolvedValue({
      entitled: false,
      error: null,
    });
    await expect(
      canExecuteInspectionForProduct({
        supabase: supabaseWithUser() as never,
        shopId: "shop-1",
        workOrderId: null,
      }),
    ).resolves.toBe(false);
  });

  it("fails closed for a role without inspection capability", async () => {
    mocks.resolveCanonicalStaffProfile.mockResolvedValue({
      profile: {
        id: "profile-1",
        user_id: "auth-user-1",
        shop_id: "shop-1",
        role: "parts",
      },
      error: null,
    });
    const { canExecuteInspectionForProduct } =
      await import("@/features/inspections/server/inspectionExecutionProductAccess");

    await expect(
      canExecuteInspectionForProduct({
        supabase: supabaseWithUser() as never,
        shopId: "shop-1",
        workOrderId: "wo-linked",
      }),
    ).resolves.toBe(false);
    expect(mocks.resolveWorkOrderProductAuthority).not.toHaveBeenCalled();
  });
});
