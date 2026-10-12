import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireShopAccess: vi.fn(),
  resolveEntitlement: vi.fn(),
  loadAsset: vi.fn(),
  create: vi.fn(),
  seed: vi.fn(),
  detail: vi.fn(),
  update: vi.fn(),
  apply: vi.fn(),
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
vi.mock("@/features/equipment/server/equipmentComponentService", () => {
  class EquipmentComponentError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  }
  return {
    EquipmentComponentError,
    loadAssetComponents: mocks.loadAsset,
    createComponent: mocks.create,
    seedStandardComponents: mocks.seed,
    loadComponentDetail: mocks.detail,
    updateComponent: mocks.update,
    applyComponentAction: mocks.apply,
  };
});

import {
  GET as getAssetComponents,
  POST as postAssetComponents,
} from "../app/api/equipment/assets/[assetId]/components/route";
import { GET as getComponent, PATCH as patchComponent } from "../app/api/equipment/components/[componentId]/route";
import { POST as postAction } from "../app/api/equipment/components/[componentId]/actions/route";
import { EquipmentComponentError } from "@/features/equipment/server/equipmentComponentService";

const SHOP_ID = "00000000-0000-4000-8000-000000000111";
const USER_ID = "00000000-0000-4000-8000-000000000222";
const ASSET_ID = "00000000-0000-4000-8000-000000000333";
const COMPONENT_ID = "00000000-0000-4000-8000-000000000444";

const assetContext = (assetId = ASSET_ID) => ({ params: Promise.resolve({ assetId }) });
const componentContext = (componentId = COMPONENT_ID) => ({ params: Promise.resolve({ componentId }) });

function access(role = "manager") {
  return {
    ok: true,
    profile: { shop_id: SHOP_ID },
    canonicalRole: role,
    authUserId: USER_ID,
    supabase: { scoped: true },
  };
}

function request(method: string, body: unknown) {
  return new Request("http://localhost/api", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function allowedRoles(): string[] {
  return mocks.requireShopAccess.mock.calls.at(-1)?.[0]?.allowRoles ?? [];
}

describe("Equipment component routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireShopAccess.mockResolvedValue(access());
    mocks.resolveEntitlement.mockResolvedValue({ enabled: true });
    mocks.loadAsset.mockResolvedValue({ assetHours: 1200, tree: [] });
    mocks.create.mockResolvedValue(COMPONENT_ID);
    mocks.seed.mockResolvedValue(7);
    mocks.detail.mockResolvedValue({ component: { id: COMPONENT_ID }, asset: null, history: [] });
  });

  it("lets assigned mechanics read an asset's components through the asset rules", async () => {
    mocks.requireShopAccess.mockResolvedValue(access("mechanic"));
    const response = await getAssetComponents(new Request("http://localhost"), assetContext());
    expect(allowedRoles()).toContain("mechanic");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ entitled: true, canEdit: false, assetHours: 1200, tree: [] });
    expect(mocks.loadAsset).toHaveBeenCalledWith({
      supabase: { scoped: true },
      admin: { admin: true },
      shopId: SHOP_ID,
      role: "mechanic",
      assetId: ASSET_ID,
    });
  });

  it("404s an asset the caller cannot see", async () => {
    mocks.loadAsset.mockResolvedValue(null);
    const response = await getAssetComponents(new Request("http://localhost"), assetContext());
    expect(response.status).toBe(404);
  });

  it("reports entitled:false on reads and refuses writes without Equipment", async () => {
    mocks.resolveEntitlement.mockResolvedValue({ enabled: false });
    const read = await getAssetComponents(new Request("http://localhost"), assetContext());
    expect(await read.json()).toEqual({ entitled: false });
    const write = await postAssetComponents(request("POST", { seed: true }), assetContext());
    expect(write.status).toBe(403);
    expect(mocks.loadAsset).not.toHaveBeenCalled();
    expect(mocks.seed).not.toHaveBeenCalled();
  });

  it("returns 503 when entitlement cannot be verified", async () => {
    mocks.resolveEntitlement.mockRejectedValue(new Error("down"));
    const response = await getAssetComponents(new Request("http://localhost"), assetContext());
    expect(response.status).toBe(503);
  });

  it("keeps mechanics out of every write and shop-wide history", async () => {
    await postAssetComponents(request("POST", { seed: true }), assetContext());
    expect(allowedRoles()).not.toContain("mechanic");
    await patchComponent(request("PATCH", { componentType: "engine" }), componentContext());
    expect(allowedRoles()).not.toContain("mechanic");
    await postAction(request("POST", { action: "repaired" }), componentContext());
    expect(allowedRoles()).not.toContain("mechanic");
    await getComponent(new Request("http://localhost"), componentContext());
    expect(allowedRoles()).not.toContain("mechanic");
  });

  it("seeds the standard hierarchy", async () => {
    const response = await postAssetComponents(request("POST", { seed: true }), assetContext());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ created: 7 });
    expect(mocks.seed).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: SHOP_ID, actorUserId: USER_ID, assetId: ASSET_ID }),
    );
  });

  it("creates and installs a validated component on the route's asset", async () => {
    const response = await postAssetComponents(
      request("POST", { componentType: "turbocharger", parentComponentId: COMPONENT_ID, shopId: "ignored" }),
      assetContext(),
    );
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: SHOP_ID,
        fields: expect.objectContaining({ componentType: "turbocharger" }),
        install: { assetId: ASSET_ID, parentComponentId: COMPONENT_ID },
      }),
    );
  });

  it("rejects invalid bodies before touching entitlement or data", async () => {
    expect((await postAssetComponents(request("POST", { componentType: "nope" }), assetContext())).status).toBe(400);
    expect(
      (await postAssetComponents(request("POST", { componentType: "engine", parentComponentId: "x" }), assetContext()))
        .status,
    ).toBe(400);
    expect((await postAction(request("POST", { action: "install" }), componentContext())).status).toBe(400);
    expect((await getComponent(new Request("http://localhost"), componentContext("bad"))).status).toBe(404);
    expect(mocks.resolveEntitlement).not.toHaveBeenCalled();
  });

  it("surfaces service status codes", async () => {
    mocks.apply.mockRejectedValue(new EquipmentComponentError("Scrapped components cannot change.", 409));
    const response = await postAction(request("POST", { action: "repaired" }), componentContext());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Scrapped components cannot change." });
  });

  it("returns component detail for shop-wide roles", async () => {
    const response = await getComponent(new Request("http://localhost"), componentContext());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ entitled: true, canEdit: true, component: { id: COMPONENT_ID } });
  });
});
