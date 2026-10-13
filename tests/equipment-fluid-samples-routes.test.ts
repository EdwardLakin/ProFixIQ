import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireShopAccess: vi.fn(),
  resolveEntitlement: vi.fn(),
  load: vi.fn(),
  record: vi.fn(),
  voidSample: vi.fn(),
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
vi.mock("@/features/equipment/server/equipmentPmService", () => ({
  EquipmentPmError: class extends Error {},
}));
vi.mock("@/features/equipment/server/equipmentFluidSampleService", () => {
  class EquipmentFluidSampleError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  }
  return {
    EquipmentFluidSampleError,
    loadAssetFluidSamples: mocks.load,
    recordFluidSample: mocks.record,
    voidFluidSample: mocks.voidSample,
  };
});

import { GET, POST } from "../app/api/equipment/assets/[assetId]/fluid-samples/route";
import { POST as VOID } from "../app/api/equipment/fluid-samples/[sampleId]/void/route";
import { EquipmentFluidSampleError } from "@/features/equipment/server/equipmentFluidSampleService";

const SHOP_ID = "00000000-0000-4000-8000-000000000111";
const USER_ID = "00000000-0000-4000-8000-000000000222";
const ASSET_ID = "00000000-0000-4000-8000-000000000333";
const SAMPLE_ID = "00000000-0000-4000-8000-000000000555";

const assetContext = { params: Promise.resolve({ assetId: ASSET_ID }) };
const sampleContext = { params: Promise.resolve({ sampleId: SAMPLE_ID }) };

function access(role = "manager") {
  return {
    ok: true,
    profile: { shop_id: SHOP_ID },
    canonicalRole: role,
    authUserId: USER_ID,
    supabase: { scoped: true },
  };
}

function request(body: unknown) {
  return new Request("http://localhost/api", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const allowedRoles = (): string[] => mocks.requireShopAccess.mock.calls.at(-1)?.[0]?.allowRoles ?? [];

describe("Equipment fluid sample routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireShopAccess.mockResolvedValue(access());
    mocks.resolveEntitlement.mockResolvedValue({ enabled: true });
    mocks.load.mockResolvedValue({ groups: [], components: [], assetHours: null });
    mocks.record.mockResolvedValue({ id: SAMPLE_ID });
    mocks.voidSample.mockResolvedValue({ id: SAMPLE_ID });
  });

  it("lets assigned mechanics read and record, but not void", async () => {
    mocks.requireShopAccess.mockResolvedValue(access("mechanic"));
    const read = await GET(new Request("http://localhost"), assetContext);
    expect(await read.json()).toMatchObject({ entitled: true, canRecord: true, canVoid: false, groups: [] });
    expect(mocks.load).toHaveBeenCalledWith(
      expect.objectContaining({ role: "mechanic", shopId: SHOP_ID, assetId: ASSET_ID, supabase: { scoped: true } }),
    );

    const recorded = await POST(request({ fluidType: "engine_oil", operationKey: "k" }), assetContext);
    expect(recorded.status).toBe(201);
    expect(await recorded.json()).toEqual({ sample: { id: SAMPLE_ID } });
    expect(allowedRoles()).toContain("mechanic");
    expect(allowedRoles()).not.toContain("parts");
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: ASSET_ID, actorUserId: USER_ID, shopId: SHOP_ID, body: { fluidType: "engine_oil", operationKey: "k" } }),
    );

    await VOID(request({ reason: "x" }), sampleContext);
    expect(allowedRoles()).not.toContain("mechanic");
  });

  it("passes voids through for managers", async () => {
    const response = await VOID(request({ reason: "Wrong", operationKey: "k" }), sampleContext);
    expect(response.status).toBe(200);
    expect(mocks.voidSample).toHaveBeenCalledWith(expect.objectContaining({ sampleId: SAMPLE_ID, actorUserId: USER_ID }));
  });

  it("hides fluid samples without Equipment and refuses writes", async () => {
    mocks.resolveEntitlement.mockResolvedValue({ enabled: false });
    expect(await (await GET(new Request("http://localhost"), assetContext)).json()).toEqual({ entitled: false });
    expect((await POST(request({ fluidType: "engine_oil" }), assetContext)).status).toBe(403);
    expect((await VOID(request({ reason: "x" }), sampleContext)).status).toBe(403);
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.voidSample).not.toHaveBeenCalled();
  });

  it("rejects bad ids and bodies before entitlement or data access", async () => {
    expect((await GET(new Request("http://localhost"), { params: Promise.resolve({ assetId: "x" }) })).status).toBe(404);
    expect((await POST(request({}), { params: Promise.resolve({ assetId: "x" }) })).status).toBe(404);
    expect((await POST(request([1]), assetContext)).status).toBe(400);
    expect((await VOID(request({}), { params: Promise.resolve({ sampleId: "x" }) })).status).toBe(404);
    expect((await VOID(request("nope"), sampleContext)).status).toBe(400);
    expect(mocks.resolveEntitlement).not.toHaveBeenCalled();
  });

  it("returns the access denial unchanged", async () => {
    mocks.requireShopAccess.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await POST(request({}), assetContext)).status).toBe(403);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("surfaces service status codes", async () => {
    mocks.record.mockRejectedValue(
      new EquipmentFluidSampleError("This lab report number is already recorded for this asset.", 409),
    );
    const duplicate = await POST(request({ fluidType: "engine_oil" }), assetContext);
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({ error: "This lab report number is already recorded for this asset." });
    mocks.load.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost"), assetContext)).status).toBe(404);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.voidSample.mockRejectedValue(new Error("boom"));
    expect((await VOID(request({ reason: "x" }), sampleContext)).status).toBe(500);
  });
});
