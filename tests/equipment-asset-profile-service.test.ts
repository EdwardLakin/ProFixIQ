import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  EquipmentAssetProfileError,
  saveEquipmentAssetProfile,
} from "@/features/equipment/server/equipmentAssetProfileService";
import type { EquipmentAssetProfileMutation } from "@/features/equipment/lib/assetProfile";

const SHOP = "00000000-0000-4000-8000-000000000111";
const ASSET = "00000000-0000-4000-8000-000000000001";
const HOST = "00000000-0000-4000-8000-000000000002";
const USER = "00000000-0000-4000-8000-000000000999";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

/** Minimal chainable Supabase fake honouring eq filters, update and upsert. */
function fakeClient(tables: Tables, log: string[], name: string) {
  return {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      let patch: Row | null = null;
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
        update: (value: Row) => {
          patch = value;
          return builder;
        },
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        upsert: async (value: Row) => {
          log.push(`${name}:upsert:${table}`);
          const list = (tables[table] ??= []);
          const index = list.findIndex((row) => row.vehicle_id === value.vehicle_id);
          if (index >= 0) list[index] = { ...list[index], ...value, updated_at: "now" };
          else list.push({ attributes: {}, updated_at: "now", ...value });
          return { error: null };
        },
        then: (resolve: (value: unknown) => void) => {
          if (patch) {
            log.push(`${name}:update:${table}`);
            const matched = rows();
            for (const row of matched) Object.assign(row, patch);
            resolve({ data: matched.map((row) => ({ id: row.id })), error: null });
          } else {
            resolve({ data: rows(), error: null });
          }
        },
      };
      return builder;
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

function setup(extra: Tables = {}) {
  const tables: Tables = {
    vehicles: [
      { id: ASSET, shop_id: SHOP, engine_hours: 100, mileage: null, unit_number: "EX-1" },
      { id: HOST, shop_id: SHOP, engine_hours: 5, mileage: null, unit_number: "EX-2" },
      { id: "other", shop_id: "other-shop", engine_hours: 1, mileage: null },
    ],
    equipment_asset_profiles: [],
    ...extra,
  };
  const log: string[] = [];
  return {
    tables,
    log,
    supabase: fakeClient(tables, log, "scoped") as never,
    admin: fakeClient(tables, log, "admin") as never,
  };
}

describe("saveEquipmentAssetProfile", () => {
  it("writes meters through the caller-scoped client and the profile through the admin client", async () => {
    const env = setup();
    const saved = await saveEquipmentAssetProfile({
      supabase: env.supabase,
      admin: env.admin,
      shopId: SHOP,
      actorUserId: USER,
      assetId: ASSET,
      mutation: mutation({ engineHours: 4210 }),
      now: new Date("2026-10-11T00:00:00Z"),
    });
    expect(env.log).toEqual([
      "scoped:update:vehicles",
      "admin:upsert:equipment_asset_profiles",
    ]);
    expect(saved.asset.engineHours).toBe(4210);
    expect(saved.profile?.equipmentClassLabel).toBe("Crawler excavator");
    expect(env.tables.equipment_asset_profiles[0]).toMatchObject({
      shop_id: SHOP,
      created_by: USER,
      updated_by: USER,
      meters_updated_at: "2026-10-11T00:00:00.000Z",
    });
  });

  it("skips the vehicles write when meters are unchanged", async () => {
    const env = setup();
    await saveEquipmentAssetProfile({
      supabase: env.supabase,
      admin: env.admin,
      shopId: SHOP,
      actorUserId: USER,
      assetId: ASSET,
      mutation: mutation({ engineHours: 100 }),
    });
    expect(env.log).toEqual(["admin:upsert:equipment_asset_profiles"]);
  });

  it("treats a cross-shop asset as not found and writes nothing", async () => {
    const env = setup();
    await expect(
      saveEquipmentAssetProfile({
        supabase: env.supabase,
        admin: env.admin,
        shopId: SHOP,
        actorUserId: USER,
        assetId: "other",
        mutation: mutation(),
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(env.log).toEqual([]);
  });

  it("rejects a host asset outside the shop and mutual mounting", async () => {
    const env = setup();
    await expect(
      saveEquipmentAssetProfile({
        supabase: env.supabase,
        admin: env.admin,
        shopId: SHOP,
        actorUserId: USER,
        assetId: ASSET,
        mutation: mutation({ mountedOnAssetId: "other" }),
      }),
    ).rejects.toBeInstanceOf(EquipmentAssetProfileError);

    env.tables.equipment_asset_profiles.push({
      vehicle_id: HOST,
      shop_id: SHOP,
      equipment_class: "attachment",
      equipment_family: "attachments",
      primary_meter: "none",
      operating_status: "operational",
      mounted_on_vehicle_id: ASSET,
      attributes: {},
      updated_at: "now",
    });
    await expect(
      saveEquipmentAssetProfile({
        supabase: env.supabase,
        admin: env.admin,
        shopId: SHOP,
        actorUserId: USER,
        assetId: ASSET,
        mutation: mutation({ mountedOnAssetId: HOST }),
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(env.log).toEqual([]);
  });
});
