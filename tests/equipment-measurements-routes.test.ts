import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireShopAccess: vi.fn(),
  resolveEntitlement: vi.fn(),
  load: vi.fn(),
  record: vi.fn(),
  correct: vi.fn(),
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
vi.mock("@/features/equipment/server/equipmentMeasurementService", () => {
  class EquipmentMeasurementError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  }
  return {
    EquipmentMeasurementError,
    loadAssetMeasurements: mocks.load,
    recordMeasurements: mocks.record,
    correctMeasurement: mocks.correct,
  };
});

import { GET, POST } from "../app/api/equipment/assets/[assetId]/measurements/route";
import { POST as CORRECT } from "../app/api/equipment/measurements/[measurementId]/correct/route";
import { EquipmentMeasurementError } from "@/features/equipment/server/equipmentMeasurementService";

const SHOP_ID = "00000000-0000-4000-8000-000000000111";
const USER_ID = "00000000-0000-4000-8000-000000000222";
const ASSET_ID = "00000000-0000-4000-8000-000000000333";
const MEASUREMENT_ID = "00000000-0000-4000-8000-000000000444";
const KEY = "00000000-0000-4000-8000-0000000000aa";

const assetContext = { params: Promise.resolve({ assetId: ASSET_ID }) };
const measurementContext = { params: Promise.resolve({ measurementId: MEASUREMENT_ID }) };

function access(role = "manager") {
  return {
    ok: true,
    profile: { shop_id: SHOP_ID },
    canonicalRole: role,
    authUserId: USER_ID,
    supabase: { scoped: true },
  };
}

function post(body: unknown) {
  return new Request("http://localhost/api", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const allowedRoles = (): string[] => mocks.requireShopAccess.mock.calls.at(-1)?.[0]?.allowRoles ?? [];
const readings = [{ measurementType: "track_shoe_height", value: 42, unit: "mm" }];

describe("Equipment measurement routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireShopAccess.mockResolvedValue(access());
    mocks.resolveEntitlement.mockResolvedValue({ enabled: true });
    mocks.load.mockResolvedValue({ assetHours: 10, series: [], components: [] });
    mocks.record.mockResolvedValue([MEASUREMENT_ID]);
    mocks.correct.mockResolvedValue(MEASUREMENT_ID);
  });

  it("lets assigned mechanics read and record through the asset rules", async () => {
    mocks.requireShopAccess.mockResolvedValue(access("mechanic"));
    const read = await GET(new Request("http://localhost"), assetContext);
    expect(await read.json()).toEqual({ entitled: true, canRecord: true, assetHours: 10, series: [], components: [] });
    const write = await POST(post({ readings, operationKey: KEY }), assetContext);
    expect(allowedRoles()).toContain("mechanic");
    expect(allowedRoles()).not.toContain("parts");
    expect(write.status).toBe(201);
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({ role: "mechanic", shopId: SHOP_ID, actorUserId: USER_ID, assetId: ASSET_ID }),
    );
  });

  it("hides measurements without Equipment and refuses writes", async () => {
    mocks.resolveEntitlement.mockResolvedValue({ enabled: false });
    expect(await (await GET(new Request("http://localhost"), assetContext)).json()).toEqual({ entitled: false });
    expect((await POST(post({ readings, operationKey: KEY }), assetContext)).status).toBe(403);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("validates before entitlement or data access", async () => {
    expect((await POST(post({ readings }), assetContext)).status).toBe(400);
    expect((await CORRECT(post({ void: true, operationKey: KEY }), measurementContext)).status).toBe(400);
    expect(mocks.resolveEntitlement).not.toHaveBeenCalled();
  });

  it("passes corrections through and surfaces service status codes", async () => {
    const ok = await CORRECT(post({ void: true, reason: "Wrong machine", operationKey: KEY }), measurementContext);
    expect(ok.status).toBe(201);
    mocks.correct.mockRejectedValue(new EquipmentMeasurementError("You can only correct readings you recorded.", 403));
    const denied = await CORRECT(post({ void: true, reason: "x", operationKey: KEY }), measurementContext);
    expect(denied.status).toBe(403);
  });
});
