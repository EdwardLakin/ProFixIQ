import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireShopAccess: vi.fn(),
  resolveEntitlement: vi.fn(),
  load: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireShopAccess,
}));
vi.mock("@/features/equipment/server/equipmentAddonEntitlement", () => ({
  resolveEquipmentAddonEntitlementForShop: mocks.resolveEntitlement,
}));
vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: () => ({ admin: true }),
}));
vi.mock("@/features/equipment/server/equipmentAssetProfileService", async () => {
  class EquipmentAssetProfileError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  }
  return {
    EquipmentAssetProfileError,
    loadEquipmentAssetRecord: mocks.load,
    saveEquipmentAssetProfile: mocks.save,
  };
});

import { GET, PUT } from "../app/api/equipment/assets/[assetId]/profile/route";

const SHOP_ID = "00000000-0000-4000-8000-000000000111";
const USER_ID = "00000000-0000-4000-8000-000000000222";
const ASSET_ID = "00000000-0000-4000-8000-000000000333";
const record = {
  asset: { id: ASSET_ID, unitNumber: "EX-1" },
  profile: null,
};

function context(assetId = ASSET_ID) {
  return { params: Promise.resolve({ assetId }) };
}

function access(role = "owner") {
  return {
    ok: true,
    profile: { shop_id: SHOP_ID },
    canonicalRole: role,
    authUserId: USER_ID,
    supabase: { scoped: true },
  };
}

function putRequest(body: unknown) {
  return new Request("http://localhost/api", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("Equipment asset profile route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireShopAccess.mockResolvedValue(access());
    mocks.resolveEntitlement.mockResolvedValue({ enabled: true });
    mocks.load.mockResolvedValue(record);
    mocks.save.mockResolvedValue(record);
  });

  it("returns entitled:false without loading data for a shop without Equipment", async () => {
    mocks.resolveEntitlement.mockResolvedValue({ enabled: false });
    const response = await GET(new Request("http://localhost"), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ entitled: false });
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it("loads with the caller-scoped client and server-derived shop", async () => {
    const response = await GET(new Request("http://localhost"), context());
    expect(response.status).toBe(200);
    expect(mocks.load).toHaveBeenCalledWith({
      supabase: { scoped: true },
      shopId: SHOP_ID,
      assetId: ASSET_ID,
    });
    expect((await response.json()).canEdit).toBe(true);
  });

  it("reports read-only access for non-operator readers", async () => {
    mocks.requireShopAccess.mockResolvedValue(access("mechanic"));
    const response = await GET(new Request("http://localhost"), context());
    expect((await response.json()).canEdit).toBe(false);
  });

  it("hides a missing or cross-shop asset as 404", async () => {
    mocks.load.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost"), context())).status).toBe(404);
    expect((await GET(new Request("http://localhost"), context("nope"))).status).toBe(404);
  });

  it("fails closed with 503 when entitlement cannot be verified", async () => {
    mocks.resolveEntitlement.mockRejectedValue(new Error("stripe down"));
    expect((await GET(new Request("http://localhost"), context())).status).toBe(503);
    expect(
      (await PUT(putRequest({ equipmentClass: "wheel_loader" }), context())).status,
    ).toBe(503);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("restricts writes to billing operators", async () => {
    await PUT(putRequest({ equipmentClass: "wheel_loader" }), context());
    expect(mocks.requireShopAccess).toHaveBeenLastCalledWith({
      allowRoles: ["owner", "admin", "manager", "advisor", "service"],
    });
  });

  it("refuses writes without the Equipment add-on", async () => {
    mocks.resolveEntitlement.mockResolvedValue({ enabled: false });
    const response = await PUT(putRequest({ equipmentClass: "wheel_loader" }), context());
    expect(response.status).toBe(403);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("validates before saving and saves with server-derived scope", async () => {
    expect((await PUT(putRequest({ equipmentClass: "bogus" }), context())).status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();

    const response = await PUT(
      putRequest({ equipmentClass: "wheel_loader", shopId: "attacker-shop" }),
      context(),
    );
    expect(response.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: SHOP_ID,
        actorUserId: USER_ID,
        assetId: ASSET_ID,
        supabase: { scoped: true },
        admin: { admin: true },
        mutation: expect.objectContaining({ equipmentFamily: "loading" }),
      }),
    );
  });
});
