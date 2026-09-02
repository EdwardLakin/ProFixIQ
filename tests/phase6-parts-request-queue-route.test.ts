import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireShopScopedApiAccess: vi.fn(),
  loadPartsRequestQueue: vi.fn(),
  resolveShopProductAccess: vi.fn(),
  getMobileFieldServiceAccess: vi.fn(),
  listFieldOperatorAssignedWorkOrderIds: vi.fn(),
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireShopScopedApiAccess,
}));

vi.mock("@/features/shared/lib/product-access", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/features/shared/lib/product-access")
  >()),
  resolveShopProductAccess: mocks.resolveShopProductAccess,
}));

vi.mock("@/features/mobile/service/server/access", () => ({
  getMobileFieldServiceAccess: mocks.getMobileFieldServiceAccess,
  listFieldOperatorAssignedWorkOrderIds:
    mocks.listFieldOperatorAssignedWorkOrderIds,
}));

vi.mock(
  "@/features/parts/server/loadPartsRequestQueue",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/features/parts/server/loadPartsRequestQueue")
    >()),
    loadPartsRequestQueue: mocks.loadPartsRequestQueue,
  }),
);

const SHOP_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";

describe("Parts request queue API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireShopScopedApiAccess.mockResolvedValue({
      ok: true,
      authUserId: "user-1",
      canonicalRole: "parts",
      profile: { id: "profile-1", shop_id: SHOP_ID },
      supabase: { from: vi.fn() },
    });
    mocks.resolveShopProductAccess.mockResolvedValue({
      entitled: true,
      error: null,
    });
    mocks.getMobileFieldServiceAccess.mockResolvedValue({
      canAccessFieldService: true,
    });
    mocks.listFieldOperatorAssignedWorkOrderIds.mockResolvedValue([]);
    mocks.loadPartsRequestQueue.mockResolvedValue({
      shopId: SHOP_ID,
      requests: [],
      items: [],
      workOrders: [],
      menuItems: [],
    });
  });

  it("authorizes the Parts roles and derives the shop scope server-side", async () => {
    const { GET } = await import("../app/api/parts/requests/queue/route");
    const { PARTS_REQUEST_QUEUE_ROLES } =
      await import("@/features/parts/server/loadPartsRequestQueue");

    const response = await GET(
      new Request(
        `https://profixiq.test/api/parts/requests/queue?requestId=${REQUEST_ID}`,
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.requireShopScopedApiAccess).toHaveBeenCalledWith({
      allowRoles: PARTS_REQUEST_QUEUE_ROLES,
      requiredProductCapabilities: ["shop", "field_service"],
    });
    expect(mocks.loadPartsRequestQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: SHOP_ID,
        requestId: REQUEST_ID,
      }),
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("returns the denied response without executing the aggregate", async () => {
    mocks.requireShopScopedApiAccess.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Forbidden" }, { status: 403 }),
    });
    const { GET } = await import("../app/api/parts/requests/queue/route");

    const response = await GET(
      new Request("https://profixiq.test/api/parts/requests/queue"),
    );

    expect(response.status).toBe(403);
    expect(mocks.loadPartsRequestQueue).not.toHaveBeenCalled();
  });

  it("denies a Field-only tenant when the canonical actor contract denies access", async () => {
    mocks.resolveShopProductAccess.mockResolvedValue({
      entitled: false,
      error: null,
    });
    mocks.getMobileFieldServiceAccess.mockResolvedValue({
      canAccessFieldService: false,
    });
    const { GET } = await import("../app/api/parts/requests/queue/route");

    const response = await GET(
      new Request("https://profixiq.test/api/parts/requests/queue"),
    );

    expect(response.status).toBe(403);
    expect(mocks.loadPartsRequestQueue).not.toHaveBeenCalled();
  });

  it("limits an authorized Field queue to linked mobile work orders", async () => {
    mocks.resolveShopProductAccess.mockResolvedValue({
      entitled: false,
      error: null,
    });
    mocks.listFieldOperatorAssignedWorkOrderIds.mockResolvedValue([
      "33333333-3333-4333-8333-333333333333",
    ]);
    const { GET } = await import("../app/api/parts/requests/queue/route");

    const response = await GET(
      new Request("https://profixiq.test/api/parts/requests/queue"),
    );

    expect(response.status).toBe(200);
    expect(mocks.loadPartsRequestQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        workOrderIds: ["33333333-3333-4333-8333-333333333333"],
      }),
    );
  });

  it("rejects an invalid realtime request ID", async () => {
    const { GET } = await import("../app/api/parts/requests/queue/route");

    const response = await GET(
      new Request(
        "https://profixiq.test/api/parts/requests/queue?requestId=not-a-uuid",
      ),
    );

    expect(response.status).toBe(400);
    expect(mocks.loadPartsRequestQueue).not.toHaveBeenCalled();
  });

  it("surfaces a recoverable aggregate failure without leaking database details", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mocks.loadPartsRequestQueue.mockRejectedValue(
      new Error("relation private_parts_table does not exist"),
    );
    const { GET } = await import("../app/api/parts/requests/queue/route");

    const response = await GET(
      new Request("https://profixiq.test/api/parts/requests/queue"),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "The Parts request queue could not be loaded.",
    });
    expect(response.headers.get("x-request-id")).toBeTruthy();
    consoleError.mockRestore();
  });
});
