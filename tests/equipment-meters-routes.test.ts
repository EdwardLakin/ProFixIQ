import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireShopAccess: vi.fn(),
  resolveEntitlement: vi.fn(),
  load: vi.fn(),
  record: vi.fn(),
  voidReading: vi.fn(),
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
vi.mock("@/features/equipment/server/equipmentMeterService", () => {
  class EquipmentMeterError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  }
  return {
    EquipmentMeterError,
    loadAssetMeters: mocks.load,
    recordMeterReading: mocks.record,
    voidMeterReading: mocks.voidReading,
  };
});

import { GET, POST } from "../app/api/equipment/assets/[assetId]/meters/route";
import { POST as VOID } from "../app/api/equipment/meter-readings/[readingId]/void/route";
import { EquipmentMeterError } from "@/features/equipment/server/equipmentMeterService";

const SHOP_ID = "00000000-0000-4000-8000-000000000111";
const USER_ID = "00000000-0000-4000-8000-000000000222";
const ASSET_ID = "00000000-0000-4000-8000-000000000333";
const READING_ID = "00000000-0000-4000-8000-000000000444";

const assetContext = { params: Promise.resolve({ assetId: ASSET_ID }) };
const readingContext = { params: Promise.resolve({ readingId: READING_ID }) };

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

describe("Equipment meter routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireShopAccess.mockResolvedValue(access());
    mocks.resolveEntitlement.mockResolvedValue({ enabled: true });
    mocks.load.mockResolvedValue({ timeline: [], rates: {}, projections: [] });
    mocks.record.mockResolvedValue({ id: READING_ID });
    mocks.voidReading.mockResolvedValue({ id: READING_ID });
  });

  it("lets assigned mechanics read and record, but not void", async () => {
    mocks.requireShopAccess.mockResolvedValue(access("mechanic"));
    const read = await GET(new Request("http://localhost"), assetContext);
    expect(await read.json()).toMatchObject({ entitled: true, canManage: false, canRecord: true });
    expect(mocks.load).toHaveBeenCalledWith(
      expect.objectContaining({ role: "mechanic", shopId: SHOP_ID, assetId: ASSET_ID, supabase: { scoped: true } }),
    );

    const recorded = await POST(request({ engineHours: 10, operationKey: "k" }), assetContext);
    expect(recorded.status).toBe(201);
    expect(await recorded.json()).toEqual({ reading: { id: READING_ID } });
    expect(allowedRoles()).toContain("mechanic");
    expect(allowedRoles()).not.toContain("parts");
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: ASSET_ID, actorUserId: USER_ID, shopId: SHOP_ID, body: { engineHours: 10, operationKey: "k" } }),
    );

    await VOID(request({ reason: "x" }), readingContext);
    expect(allowedRoles()).not.toContain("mechanic");
  });

  it("passes voids through for managers", async () => {
    const response = await VOID(request({ reason: "Misread" }), readingContext);
    expect(response.status).toBe(200);
    expect(mocks.voidReading).toHaveBeenCalledWith(
      expect.objectContaining({ readingId: READING_ID, shopId: SHOP_ID, actorUserId: USER_ID }),
    );
  });

  it("returns the access response when the caller is refused", async () => {
    mocks.requireShopAccess.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await POST(request({ engineHours: 1 }), assetContext)).status).toBe(403);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("hides meters without Equipment and refuses writes", async () => {
    mocks.resolveEntitlement.mockResolvedValue({ enabled: false });
    expect(await (await GET(new Request("http://localhost"), assetContext)).json()).toEqual({ entitled: false });
    expect((await POST(request({ engineHours: 1 }), assetContext)).status).toBe(403);
    expect((await VOID(request({ reason: "x" }), readingContext)).status).toBe(403);
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.voidReading).not.toHaveBeenCalled();
  });

  it("reports entitlement lookup failures as retryable", async () => {
    mocks.resolveEntitlement.mockRejectedValue(new Error("down"));
    expect((await GET(new Request("http://localhost"), assetContext)).status).toBe(503);
  });

  it("rejects bad ids and bodies before entitlement or data access", async () => {
    expect((await GET(new Request("http://localhost"), { params: Promise.resolve({ assetId: "x" }) })).status).toBe(404);
    expect((await POST(request({ engineHours: 1 }), { params: Promise.resolve({ assetId: "x" }) })).status).toBe(404);
    expect((await POST(request([1]), assetContext)).status).toBe(400);
    expect((await VOID(request("nope"), readingContext)).status).toBe(400);
    expect((await VOID(request({ reason: "x" }), { params: Promise.resolve({ readingId: "x" }) })).status).toBe(404);
    expect(mocks.resolveEntitlement).not.toHaveBeenCalled();
  });

  it("surfaces service status codes and hides unexpected errors", async () => {
    mocks.record.mockRejectedValue(new EquipmentMeterError("Enter at least one meter.", 400));
    const invalid = await POST(request({}), assetContext);
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: "Enter at least one meter." });

    mocks.load.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost"), assetContext)).status).toBe(404);

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.voidReading.mockRejectedValue(new Error("secret detail"));
    const failed = await VOID(request({ reason: "x" }), readingContext);
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: "The reading could not be voided." });
    spy.mockRestore();
  });
});
