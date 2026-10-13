import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireShopAccess: vi.fn(),
  resolveEntitlement: vi.fn(),
  load: vi.fn(),
  link: vi.fn(),
  unlink: vi.fn(),
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
  return { EquipmentPmError };
});
vi.mock("@/features/equipment/server/equipmentPmWorkOrderService", () => ({
  loadAssetPmWorkOrders: mocks.load,
  linkPmWorkOrder: mocks.link,
  unlinkPmWorkOrder: mocks.unlink,
}));

import { GET } from "../app/api/equipment/assets/[assetId]/pm/work-orders/route";
import { POST as LINK } from "../app/api/equipment/pm-plans/[planId]/work-orders/route";
import { POST as UNLINK } from "../app/api/equipment/pm-work-orders/[linkId]/unlink/route";
import { EquipmentPmError } from "@/features/equipment/server/equipmentPmService";

const SHOP_ID = "00000000-0000-4000-8000-000000000111";
const USER_ID = "00000000-0000-4000-8000-000000000222";
const ASSET_ID = "00000000-0000-4000-8000-000000000333";
const PLAN_ID = "00000000-0000-4000-8000-000000000444";
const LINK_ID = "00000000-0000-4000-8000-000000000555";
const WO_ID = "00000000-0000-4000-8000-000000000666";

const assetContext = { params: Promise.resolve({ assetId: ASSET_ID }) };
const planContext = { params: Promise.resolve({ planId: PLAN_ID }) };
const linkContext = { params: Promise.resolve({ linkId: LINK_ID }) };

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

describe("Equipment PM work order routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireShopAccess.mockResolvedValue(access());
    mocks.resolveEntitlement.mockResolvedValue({ enabled: true });
    mocks.load.mockResolvedValue({ links: [], createWorkOrderHref: null, canLink: true, canUnlink: false });
    mocks.link.mockResolvedValue({ id: LINK_ID });
    mocks.unlink.mockResolvedValue({ id: LINK_ID });
  });

  it("lets assigned mechanics read and link, but not unlink", async () => {
    mocks.requireShopAccess.mockResolvedValue(access("mechanic"));
    const read = await GET(new Request("http://localhost"), assetContext);
    expect(await read.json()).toMatchObject({ entitled: true, links: [], canLink: true });
    expect(mocks.load).toHaveBeenCalledWith(
      expect.objectContaining({ role: "mechanic", shopId: SHOP_ID, assetId: ASSET_ID, supabase: { scoped: true } }),
    );

    const linked = await LINK(request({ workOrderId: WO_ID, operationKey: "k" }), planContext);
    expect(linked.status).toBe(201);
    expect(allowedRoles()).toContain("mechanic");
    expect(allowedRoles()).not.toContain("parts");
    expect(mocks.link).toHaveBeenCalledWith(
      expect.objectContaining({ planId: PLAN_ID, actorUserId: USER_ID, shopId: SHOP_ID, body: { workOrderId: WO_ID, operationKey: "k" } }),
    );

    await UNLINK(request({ operationKey: "k" }), linkContext);
    expect(allowedRoles()).not.toContain("mechanic");
  });

  it("passes unlinks through for managers", async () => {
    expect((await UNLINK(request({ operationKey: "k" }), linkContext)).status).toBe(200);
    expect(mocks.unlink).toHaveBeenCalledWith(expect.objectContaining({ linkId: LINK_ID, actorUserId: USER_ID }));
  });

  it("hides PM work orders without Equipment and refuses writes", async () => {
    mocks.resolveEntitlement.mockResolvedValue({ enabled: false });
    expect(await (await GET(new Request("http://localhost"), assetContext)).json()).toEqual({ entitled: false });
    expect((await LINK(request({ workOrderId: WO_ID }), planContext)).status).toBe(403);
    expect((await UNLINK(request({}), linkContext)).status).toBe(403);
    expect(mocks.link).not.toHaveBeenCalled();
    expect(mocks.unlink).not.toHaveBeenCalled();
  });

  it("rejects bad ids and bodies before entitlement or data access", async () => {
    expect((await GET(new Request("http://localhost"), { params: Promise.resolve({ assetId: "x" }) })).status).toBe(404);
    expect((await LINK(request({}), { params: Promise.resolve({ planId: "x" }) })).status).toBe(404);
    expect((await UNLINK(request({}), { params: Promise.resolve({ linkId: "x" }) })).status).toBe(404);
    expect((await LINK(request([1]), planContext)).status).toBe(400);
    expect((await UNLINK(request("nope"), linkContext)).status).toBe(400);
    expect(mocks.resolveEntitlement).not.toHaveBeenCalled();
  });

  it("surfaces service status codes", async () => {
    mocks.link.mockRejectedValue(new EquipmentPmError("Select one of this asset's work orders.", 400));
    const refused = await LINK(request({ workOrderId: WO_ID }), planContext);
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: "Select one of this asset's work orders." });
    mocks.load.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost"), assetContext)).status).toBe(404);
  });
});
