import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  EquipmentAssetProfileError,
  loadEquipmentAssetRecord,
  saveEquipmentAssetProfile,
} from "@/features/equipment/server/equipmentAssetProfileService";
import type { EquipmentAssetProfileMutation } from "@/features/equipment/lib/assetProfile";

const SHOP = "00000000-0000-4000-8000-000000000111";
const ASSET = "00000000-0000-4000-8000-000000000001";
const HOST = "00000000-0000-4000-8000-000000000002";
const USER = "00000000-0000-4000-8000-000000000999";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

/** Minimal chainable Supabase fake honouring eq filters, limit and rpc. */
function fakeClient(
  tables: Tables,
  log: string[],
  name: string,
  rpcResult: { error: { code: string; message: string } | null } = { error: null },
) {
  return {
    from(table: string) {
      log.push(`${name}:read:${table}`);
      const filters: Array<[string, unknown]> = [];
      const rows = () =>
        (tables[table] ?? []).filter((row) =>
          filters.every(([column, value]) => row[column] === value),
        );
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters.push([column, value]);
          return builder;
        },
        limit: async (count: number) => ({ data: rows().slice(0, count), error: null }),
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      };
      return builder;
    },
    rpc: async (fn: string, args: Row) => {
      log.push(`${name}:rpc:${fn}`);
      (tables.__rpc ??= []).push(args);
      return rpcResult;
    },
  };
}

function mutation(patch: Partial<EquipmentAssetProfileMutation> = {}): EquipmentAssetProfileMutation {
  return {
    equipmentClass: "crawler_excavator",
    equipmentFamily: "excavation",
    serialNumber: "CAT0336",
    pin: null,
    engineMake: null,
    engineModel: null,
    engineSerial: null,
    primaryMeter: "hours",
    currentCycles: null,
    siteName: "North pit",
    operatingStatus: "operational",
    mountedOnAssetId: null,
    attributes: {},
    ...patch,
  };
}

function setup(options: {
  workOrders?: Row[];
  rpcError?: { code: string; message: string };
} = {}) {
  const tables: Tables = {
    vehicles: [
      { id: ASSET, shop_id: SHOP, engine_hours: 100, mileage: "42,000 km", unit_number: "EX-1" },
      { id: HOST, shop_id: SHOP, engine_hours: 5, mileage: null, unit_number: "EX-2" },
    ],
    work_orders: options.workOrders ?? [],
    equipment_asset_profiles: [],
  };
  const log: string[] = [];
  return {
    tables,
    log,
    supabase: fakeClient(tables, log, "scoped") as never,
    admin: fakeClient(tables, log, "admin", { error: options.rpcError ?? null }) as never,
  };
}

describe("Equipment asset profile service", () => {
  it("authorizes through the caller-scoped client and reads the profile with the admin client", async () => {
    const env = setup();
    const record = await loadEquipmentAssetRecord({
      supabase: env.supabase,
      admin: env.admin,
      shopId: SHOP,
      role: "owner",
      assetId: ASSET,
    });
    expect(record?.asset.odometer).toBe("42,000 km");
    expect(env.log).toEqual([
      "scoped:read:vehicles",
      "admin:read:equipment_asset_profiles",
    ]);
  });

  it("hides an asset from a mechanic with no visible work order, like the vehicle workspace", async () => {
    const env = setup();
    expect(
      await loadEquipmentAssetRecord({
        supabase: env.supabase,
        admin: env.admin,
        shopId: SHOP,
        role: "mechanic",
        assetId: ASSET,
      }),
    ).toBeNull();
    expect(env.log).not.toContain("admin:read:equipment_asset_profiles");

    const assigned = setup({ workOrders: [{ id: "wo-1", shop_id: SHOP, vehicle_id: ASSET }] });
    expect(
      await loadEquipmentAssetRecord({
        supabase: assigned.supabase,
        admin: assigned.admin,
        shopId: SHOP,
        role: "mechanic",
        assetId: ASSET,
      }),
    ).not.toBeNull();
  });

  it("saves through the atomic RPC, sending meters only with their baseline", async () => {
    const env = setup();
    await saveEquipmentAssetProfile({
      supabase: env.supabase,
      admin: env.admin,
      shopId: SHOP,
      role: "owner",
      actorUserId: USER,
      assetId: ASSET,
      mutation: mutation({ engineHours: { value: 4210, expected: 100 } }),
    });
    expect(env.log).toContain("admin:rpc:save_equipment_asset_profile");
    expect(env.tables.__rpc[0]).toMatchObject({
      p_shop_id: SHOP,
      p_vehicle_id: ASSET,
      p_actor_user_id: USER,
      p_set_engine_hours: true,
      p_engine_hours: 4210,
      p_expected_engine_hours: 100,
      p_set_odometer: false,
    });
  });

  it("writes nothing for an asset outside the caller's shop", async () => {
    const env = setup();
    await expect(
      saveEquipmentAssetProfile({
        supabase: env.supabase,
        admin: env.admin,
        shopId: SHOP,
        role: "owner",
        actorUserId: USER,
        assetId: "00000000-0000-4000-8000-00000000dead",
        mutation: mutation(),
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(env.log).not.toContain("admin:rpc:save_equipment_asset_profile");
  });

  it("rejects a host asset the caller cannot see", async () => {
    const env = setup();
    await expect(
      saveEquipmentAssetProfile({
        supabase: env.supabase,
        admin: env.admin,
        shopId: SHOP,
        role: "owner",
        actorUserId: USER,
        assetId: ASSET,
        mutation: mutation({ mountedOnAssetId: "00000000-0000-4000-8000-00000000beef" }),
      }),
    ).rejects.toBeInstanceOf(EquipmentAssetProfileError);
    expect(env.log).not.toContain("admin:rpc:save_equipment_asset_profile");
  });

  it.each([
    ["40001", "Engine hours changed", 409],
    ["23514", "Two assets cannot be mounted on each other", 409],
    ["P0002", "Asset not found", 404],
    ["22023", "Equipment profile input is invalid", 400],
  ])("maps RPC SQLSTATE %s to HTTP %s", async (code, message, status) => {
    const env = setup({ rpcError: { code, message } });
    await expect(
      saveEquipmentAssetProfile({
        supabase: env.supabase,
        admin: env.admin,
        shopId: SHOP,
        role: "owner",
        actorUserId: USER,
        assetId: ASSET,
        mutation: mutation(),
      }),
    ).rejects.toMatchObject({ status });
  });
});
