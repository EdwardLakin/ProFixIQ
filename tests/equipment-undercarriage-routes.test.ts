import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireShopAccess: vi.fn(),
  resolveEntitlement: vi.fn(),
  load: vi.fn(),
  setLimit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireShopAccess,
}));
vi.mock("@/features/equipment/server/equipmentAddonEntitlement", () => ({
  resolveEquipmentAddonEntitlementForShop: mocks.resolveEntitlement,
}));
vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: () => ({ admin: true }),
}));
vi.mock("@/features/equipment/server/equipmentAssetProfileService", () => ({
  EquipmentAssetProfileError: class extends Error {},
}));
vi.mock("@/features/equipment/server/equipmentComponentService", () => ({
  EquipmentComponentError: class extends Error {},
}));
vi.mock("@/features/equipment/server/equipmentMeasurementService", () => ({
  EquipmentMeasurementError: class extends Error {},
}));
vi.mock("@/features/equipment/server/equipmentUndercarriageService", () => {
  class EquipmentUndercarriageError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  }
  return {
    EquipmentUndercarriageError,
    loadUndercarriage: mocks.load,
    setWearLimit: mocks.setLimit,
  };
});

import { GET } from "../app/api/equipment/assets/[assetId]/undercarriage/route";
import { PUT } from "../app/api/equipment/components/[componentId]/wear-limits/route";
import { EquipmentUndercarriageError } from "@/features/equipment/server/equipmentUndercarriageService";

const SHOP_ID = "00000000-0000-4000-8000-000000000111";
const ASSET_ID = "00000000-0000-4000-8000-000000000333";
const COMPONENT_ID = "00000000-0000-4000-8000-000000000444";

function access(role = "manager") {
  return {
    ok: true,
    profile: { shop_id: SHOP_ID },
    canonicalRole: role,
    authUserId: "00000000-0000-4000-8000-000000000222",
    supabase: { scoped: true },
  };
}

const allowedRoles = (): string[] => mocks.requireShopAccess.mock.calls.at(-1)?.[0]?.allowRoles ?? [];
const put = (body: unknown) =>
  new Request("http://localhost/api", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

describe("Equipment undercarriage routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireShopAccess.mockResolvedValue(access());
    mocks.resolveEntitlement.mockResolvedValue({ enabled: true });
    mocks.load.mockResolvedValue({ assetHours: 10, sides: [] });
    mocks.setLimit.mockResolvedValue({ id: "l1" });
  });

  it("lets assigned mechanics read wear but not set limits", async () => {
    mocks.requireShopAccess.mockResolvedValue(access("mechanic"));
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ assetId: ASSET_ID }) });
    expect(await response.json()).toEqual({
      entitled: true,
      canRecord: true,
      canSetLimits: false,
      assetHours: 10,
      sides: [],
    });
    expect(mocks.load).toHaveBeenCalledWith(expect.objectContaining({ role: "mechanic", assetId: ASSET_ID }));
    await PUT(put({ measurementType: "track_link_height" }), { params: Promise.resolve({ componentId: COMPONENT_ID }) });
    expect(allowedRoles()).not.toContain("mechanic");
  });

  it("hides the module without Equipment and refuses limit writes", async () => {
    mocks.resolveEntitlement.mockResolvedValue({ enabled: false });
    const read = await GET(new Request("http://localhost"), { params: Promise.resolve({ assetId: ASSET_ID }) });
    expect(await read.json()).toEqual({ entitled: false });
    const write = await PUT(put({ measurementType: "track_link_height" }), {
      params: Promise.resolve({ componentId: COMPONENT_ID }),
    });
    expect(write.status).toBe(403);
    expect(mocks.setLimit).not.toHaveBeenCalled();
  });

  it("surfaces service status codes", async () => {
    mocks.setLimit.mockRejectedValue(new EquipmentUndercarriageError("Wear limits apply to undercarriage components.", 400));
    const response = await PUT(put({ measurementType: "track_link_height" }), {
      params: Promise.resolve({ componentId: COMPONENT_ID }),
    });
    expect(response.status).toBe(400);
    expect((await GET(new Request("http://localhost"), { params: Promise.resolve({ assetId: "bad" }) })).status).toBe(404);
  });
});
