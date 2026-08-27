import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminSupabase: vi.fn(),
  requireShopScopedApiAccess: vi.fn(),
  resolveWorkOrderProductAuthority: vi.fn(),
  loadMobileWorkOrderDetail: vi.fn(),
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireShopScopedApiAccess,
}));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: mocks.createAdminSupabase,
}));
vi.mock("@/features/mobile/service/server/access", () => ({
  resolveWorkOrderProductAuthority: mocks.resolveWorkOrderProductAuthority,
}));

vi.mock("server-only", () => ({}));
vi.mock(
  "@/features/work-orders/mobile/server/loadMobileWorkOrderDetail",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/features/work-orders/mobile/server/loadMobileWorkOrderDetail")
    >()),
    loadMobileWorkOrderDetail: mocks.loadMobileWorkOrderDetail,
  }),
);

const WORK_ORDER_ID = "11111111-1111-4111-8111-111111111111";

function allowedAccess() {
  return {
    ok: true as const,
    authUserId: "user-1",
    canonicalRole: "advisor",
    profile: { id: "profile-1", shop_id: "shop-1" },
    supabase: { from: vi.fn() },
  };
}

describe("mobile work-order detail route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminSupabase.mockReturnValue({ from: vi.fn() });
    mocks.requireShopScopedApiAccess.mockResolvedValue(allowedAccess());
    mocks.resolveWorkOrderProductAuthority.mockResolvedValue({
      authorized: true,
      product: "shop",
    });
    mocks.loadMobileWorkOrderDetail.mockResolvedValue({
      workOrder: { id: WORK_ORDER_ID, shop_id: "shop-1" },
      lines: [],
      quoteLines: [],
      vehicle: null,
      customer: null,
      techNamesById: {},
      lineContext: {
        allocationsByLine: {},
        canonicalPartsByLine: {},
        technicianIdsByLine: {},
        activeTechnicianIdsByLine: {},
        partRequestsByLine: {},
        partRequestsByQuoteLine: {},
      },
      shopLaborRate: null,
    });
  });

  it("preserves advisor, parts, technician, and lead-tech access", async () => {
    const { GET } = await import("../app/api/mobile/work-orders/[id]/route");
    const { MOBILE_WORK_ORDER_DETAIL_ROLES } =
      await import("@/features/work-orders/mobile/server/loadMobileWorkOrderDetail");

    const response = await GET(new Request("https://profixiq.test"), {
      params: Promise.resolve({ id: WORK_ORDER_ID }),
    });

    expect(response.status).toBe(200);
    expect(MOBILE_WORK_ORDER_DETAIL_ROLES).toEqual(
      expect.arrayContaining(["advisor", "parts", "mechanic", "lead_hand"]),
    );
    expect(MOBILE_WORK_ORDER_DETAIL_ROLES).not.toEqual(
      expect.arrayContaining(["customer", "driver"]),
    );
    expect(mocks.requireShopScopedApiAccess).toHaveBeenCalledWith({
      allowRoles: MOBILE_WORK_ORDER_DETAIL_ROLES,
      requiredProductCapabilities: ["shop", "field_service"],
    });
    expect(mocks.loadMobileWorkOrderDetail).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: "shop-1", routeId: WORK_ORDER_ID }),
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ productScope: "shop" }),
    );
  });

  it("marks a relationship-authorized Field snapshot so Shop-only actions stay hidden", async () => {
    mocks.resolveWorkOrderProductAuthority.mockResolvedValue({
      authorized: true,
      product: "field",
    });
    const { GET } = await import("../app/api/mobile/work-orders/[id]/route");

    const response = await GET(new Request("https://profixiq.test"), {
      params: Promise.resolve({ id: WORK_ORDER_ID }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ productScope: "field" }),
    );
  });

  it("returns the denied role response without looking up the work order", async () => {
    mocks.requireShopScopedApiAccess.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Forbidden" }, { status: 403 }),
    });
    const { GET } = await import("../app/api/mobile/work-orders/[id]/route");

    const response = await GET(new Request("https://profixiq.test"), {
      params: Promise.resolve({ id: WORK_ORDER_ID }),
    });

    expect(response.status).toBe(403);
    expect(mocks.loadMobileWorkOrderDetail).not.toHaveBeenCalled();
  });

  it("does not load a Work Order outside the caller's product relationship", async () => {
    mocks.resolveWorkOrderProductAuthority.mockResolvedValue({
      authorized: false,
      product: null,
    });
    const { GET } = await import("../app/api/mobile/work-orders/[id]/route");

    const response = await GET(new Request("https://profixiq.test"), {
      params: Promise.resolve({ id: WORK_ORDER_ID }),
    });

    expect(response.status).toBe(404);
    expect(mocks.loadMobileWorkOrderDetail).not.toHaveBeenCalled();
  });

  it("returns a non-disclosing 404 for missing, stale, or cross-tenant ids", async () => {
    mocks.loadMobileWorkOrderDetail.mockResolvedValue(null);
    const { GET } = await import("../app/api/mobile/work-orders/[id]/route");

    const response = await GET(new Request("https://profixiq.test"), {
      params: Promise.resolve({ id: "stale-copied-link" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Work order not found.",
    });
  });

  it("returns a recoverable 500 without exposing the database error", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mocks.loadMobileWorkOrderDetail.mockRejectedValue(
      new Error("database host secret"),
    );
    const { GET } = await import("../app/api/mobile/work-orders/[id]/route");

    const response = await GET(new Request("https://profixiq.test"), {
      params: Promise.resolve({ id: WORK_ORDER_ID }),
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "This work order could not be loaded.",
    });
    consoleError.mockRestore();
  });
});
