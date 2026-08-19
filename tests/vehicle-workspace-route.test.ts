import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SHOP_ID = "a4100000-0000-4000-8000-000000000001";
const VEHICLE_ID = "a4300000-0000-4000-8000-000000000001";

const mocks = vi.hoisted(() => ({
  requireApiAccess: vi.fn(),
  requirePageAccess: vi.fn(),
  search: vi.fn(),
  loadSnapshot: vi.fn(),
  createWorkOrderHref: vi.fn(),
  createServerClient: vi.fn(),
  noStore: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireApiAccess,
  requireShopPageAccess: mocks.requirePageAccess,
}));

vi.mock("@/features/vehicles/server/searchShopVehicleRecords", () => ({
  searchShopVehicleRecords: mocks.search,
}));

vi.mock("@/features/vehicles/server/loadVehicleWorkspaceSnapshot", () => ({
  loadVehicleWorkspaceSnapshot: mocks.loadSnapshot,
  vehicleWorkspaceCreateWorkOrderHref: mocks.createWorkOrderHref,
}));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createServerSupabaseRSC: mocks.createServerClient,
}));

vi.mock("next/cache", () => ({
  unstable_noStore: mocks.noStore,
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
}));

vi.mock("@/features/vehicles/components/VehicleWorkspace", () => ({
  default: () => null,
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/vehicles/search authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiAccess.mockResolvedValue({
      ok: true,
      profile: { id: "profile-1", shop_id: SHOP_ID, role: "owner" },
      canonicalRole: "owner",
      authUserId: "user-1",
      supabase: { from: vi.fn() },
    });
    mocks.search.mockResolvedValue({
      query: "Ford",
      groups: [],
      accountsWithoutVehicles: [],
      permissions: {},
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("returns the access response before running a search for an anonymous caller", async () => {
    mocks.requireApiAccess.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Not authenticated" }, { status: 401 }),
    });
    const { GET } = await import("../app/api/vehicles/search/route");

    const response = await GET(
      new Request("https://profixiq.test/api/vehicles/search?q=Ford"),
    );

    expect(response.status).toBe(401);
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("returns the access response before running a search for a disallowed role", async () => {
    mocks.requireApiAccess.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Forbidden" }, { status: 403 }),
    });
    const { GET } = await import("../app/api/vehicles/search/route");

    const response = await GET(
      new Request("https://profixiq.test/api/vehicles/search?q=Ford"),
    );

    expect(response.status).toBe(403);
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("derives shop and role from the authenticated actor", async () => {
    const { GET } = await import("../app/api/vehicles/search/route");
    const response = await GET(
      new Request(
        "https://profixiq.test/api/vehicles/search?q=Ford&shopId=forged&role=owner",
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.search).toHaveBeenCalledWith({
      supabase: expect.any(Object),
      shopId: SHOP_ID,
      role: "owner",
      query: "Ford",
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});

describe("Vehicle Workspace page authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePageAccess.mockResolvedValue({
      profile: { id: "profile-1", shop_id: SHOP_ID, role: "owner" },
      canonicalRole: "owner",
    });
    mocks.createServerClient.mockReturnValue({ from: vi.fn() });
    mocks.createWorkOrderHref.mockReturnValue(
      `/work-orders/create?customerId=customer-1&vehicleId=${VEHICLE_ID}`,
    );
  });

  it("authorizes before rejecting a malformed vehicle ID", async () => {
    const { default: VehicleWorkspacePage } = await import(
      "../app/vehicles/[id]/page"
    );

    await expect(
      VehicleWorkspacePage({ params: Promise.resolve({ id: "not-a-uuid" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.requirePageAccess).toHaveBeenCalledTimes(1);
    expect(mocks.loadSnapshot).not.toHaveBeenCalled();
  });

  it("returns the same not-found posture for an invisible cross-shop vehicle", async () => {
    mocks.loadSnapshot.mockResolvedValue(null);
    const serverClient = { from: vi.fn() };
    mocks.createServerClient.mockReturnValue(serverClient);
    const { default: VehicleWorkspacePage } = await import(
      "../app/vehicles/[id]/page"
    );

    await expect(
      VehicleWorkspacePage({ params: Promise.resolve({ id: VEHICLE_ID }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.loadSnapshot).toHaveBeenCalledWith({
      supabase: serverClient,
      shopId: SHOP_ID,
      role: "owner",
      vehicleId: VEHICLE_ID,
    });
    expect(mocks.createWorkOrderHref).not.toHaveBeenCalled();
  });
});
