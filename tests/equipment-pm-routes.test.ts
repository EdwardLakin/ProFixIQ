import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireShopAccess: vi.fn(),
  resolveEntitlement: vi.fn(),
  load: vi.fn(),
  save: vi.fn(),
  complete: vi.fn(),
  voidCompletion: vi.fn(),
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
vi.mock("@/features/equipment/server/equipmentPmService", () => {
  class EquipmentPmError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  }
  return {
    EquipmentPmError,
    loadAssetPm: mocks.load,
    savePmPlan: mocks.save,
    recordPmCompletion: mocks.complete,
    voidPmCompletion: mocks.voidCompletion,
  };
});

import { GET, POST } from "../app/api/equipment/assets/[assetId]/pm/route";
import { PUT } from "../app/api/equipment/pm-plans/[planId]/route";
import { POST as COMPLETE } from "../app/api/equipment/pm-plans/[planId]/completions/route";
import { POST as VOID } from "../app/api/equipment/pm-completions/[completionId]/void/route";
import { EquipmentPmError } from "@/features/equipment/server/equipmentPmService";

const SHOP_ID = "00000000-0000-4000-8000-000000000111";
const USER_ID = "00000000-0000-4000-8000-000000000222";
const ASSET_ID = "00000000-0000-4000-8000-000000000333";
const PLAN_ID = "00000000-0000-4000-8000-000000000444";
const COMPLETION_ID = "00000000-0000-4000-8000-000000000555";

const assetContext = { params: Promise.resolve({ assetId: ASSET_ID }) };
const planContext = { params: Promise.resolve({ planId: PLAN_ID }) };
const completionContext = { params: Promise.resolve({ completionId: COMPLETION_ID }) };

function access(role = "manager") {
  return {
    ok: true,
    profile: { shop_id: SHOP_ID },
    canonicalRole: role,
    authUserId: USER_ID,
    supabase: { scoped: true },
  };
}

function request(body: unknown, method = "POST") {
  return new Request("http://localhost/api", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const allowedRoles = (): string[] => mocks.requireShopAccess.mock.calls.at(-1)?.[0]?.allowRoles ?? [];

describe("Equipment PM routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireShopAccess.mockResolvedValue(access());
    mocks.resolveEntitlement.mockResolvedValue({ enabled: true });
    mocks.load.mockResolvedValue({ meters: {}, plans: [], state: "not_evaluated", workOrders: [] });
    mocks.save.mockResolvedValue({ id: PLAN_ID, version: 1 });
    mocks.complete.mockResolvedValue({ id: COMPLETION_ID });
    mocks.voidCompletion.mockResolvedValue({ id: COMPLETION_ID });
  });

  it("lets assigned mechanics read and record, but not manage plans", async () => {
    mocks.requireShopAccess.mockResolvedValue(access("mechanic"));
    const read = await GET(new Request("http://localhost"), assetContext);
    expect(await read.json()).toMatchObject({ entitled: true, canManage: false, canRecord: true });
    expect(mocks.load).toHaveBeenCalledWith(expect.objectContaining({ role: "mechanic", shopId: SHOP_ID, assetId: ASSET_ID }));

    const completed = await COMPLETE(request({ assetHours: 10, operationKey: "k" }), planContext);
    expect(completed.status).toBe(201);
    expect(allowedRoles()).toContain("mechanic");
    expect(allowedRoles()).not.toContain("parts");

    await POST(request({ name: "PM" }), assetContext);
    expect(allowedRoles()).not.toContain("mechanic");
    await PUT(request({ name: "PM" }, "PUT"), planContext);
    expect(allowedRoles()).not.toContain("mechanic");
    await VOID(request({ reason: "x" }), completionContext);
    expect(allowedRoles()).not.toContain("mechanic");
  });

  it("passes plan saves through with the right asset or plan", async () => {
    expect((await POST(request({ name: "PM" }), assetContext)).status).toBe(201);
    expect(mocks.save).toHaveBeenLastCalledWith(expect.objectContaining({ assetId: ASSET_ID, planId: null, actorUserId: USER_ID }));
    expect((await PUT(request({ name: "PM" }, "PUT"), planContext)).status).toBe(200);
    expect(mocks.save).toHaveBeenLastCalledWith(expect.objectContaining({ assetId: null, planId: PLAN_ID }));
    expect((await VOID(request({ reason: "Wrong" }), completionContext)).status).toBe(200);
    expect(mocks.voidCompletion).toHaveBeenCalledWith(expect.objectContaining({ completionId: COMPLETION_ID }));
  });

  it("hides PM without Equipment and refuses writes", async () => {
    mocks.resolveEntitlement.mockResolvedValue({ enabled: false });
    expect(await (await GET(new Request("http://localhost"), assetContext)).json()).toEqual({ entitled: false });
    expect((await POST(request({ name: "PM" }), assetContext)).status).toBe(403);
    expect((await COMPLETE(request({}), planContext)).status).toBe(403);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("rejects bad ids and bodies before entitlement or data access", async () => {
    expect((await GET(new Request("http://localhost"), { params: Promise.resolve({ assetId: "x" }) })).status).toBe(404);
    expect((await POST(request([1]), assetContext)).status).toBe(400);
    expect((await COMPLETE(request("nope"), planContext)).status).toBe(400);
    expect(mocks.resolveEntitlement).not.toHaveBeenCalled();
  });

  it("surfaces service status codes", async () => {
    mocks.save.mockRejectedValue(new EquipmentPmError("The PM plan was changed by someone else.", 409));
    expect((await PUT(request({ name: "PM" }, "PUT"), planContext)).status).toBe(409);
    mocks.load.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost"), assetContext)).status).toBe(404);
  });
});
