import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadEquipmentAssetList } from "@/features/equipment/server/loadEquipmentAssetList";

const SHOP = "00000000-0000-4000-8000-000000000111";
const TRACKED = "00000000-0000-4000-8000-000000000001";
const WHEELED = "00000000-0000-4000-8000-000000000002";
const HIDDEN = "00000000-0000-4000-8000-000000000003";

type Row = Record<string, unknown>;

function fakeClient(tables: Record<string, Row[]>, log: string[], name: string) {
  return {
    from(table: string) {
      log.push(`${name}:${table}`);
      const filters: Array<(row: Row) => boolean> = [];
      let max = Infinity;
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters.push((row) => row[column] === value);
          return builder;
        },
        in: (column: string, values: unknown[]) => {
          filters.push((row) => values.includes(row[column]));
          return builder;
        },
        order: () => builder,
        limit: (count: number) => {
          max = count;
          return builder;
        },
        then: (resolve: (value: unknown) => void) =>
          resolve({
            data: (tables[table] ?? []).filter((row) => filters.every((f) => f(row))).slice(0, max),
            error: null,
          }),
      };
      return builder;
    },
  };
}

function profile(id: string, patch: Row = {}): Row {
  return {
    vehicle_id: id,
    shop_id: SHOP,
    equipment_class: "crawler_excavator",
    equipment_family: "excavation",
    serial_number: null,
    pin: null,
    engine_make: null,
    engine_model: null,
    engine_serial: null,
    primary_meter: "hours",
    current_cycles: null,
    meters_updated_at: null,
    site_name: "North pit",
    operating_status: "operational",
    mounted_on_vehicle_id: null,
    attributes: {},
    created_at: "2026-01-01T00:00:00Z",
    created_by: null,
    updated_at: "2026-01-01T00:00:00Z",
    updated_by: null,
    ...patch,
  };
}

function setup() {
  const log: string[] = [];
  const tables = {
    equipment_asset_profiles: [profile(TRACKED), profile(WHEELED), profile(HIDDEN)],
    // RLS: the caller can see two of the three assets.
    vehicles: [
      { id: TRACKED, shop_id: SHOP, customer_id: "cust-1", year: 2021, make: "Cat", model: "336", unit_number: "EX-1" },
      { id: WHEELED, shop_id: SHOP, customer_id: null, year: null, make: "Cat", model: "950", unit_number: "WL-1" },
    ],
    customers: [{ id: "cust-1", shop_id: SHOP, business_name: "Granite Co" }],
    equipment_components: [
      { shop_id: SHOP, installed_vehicle_id: TRACKED, component_type: "track_chain" },
      { shop_id: SHOP, installed_vehicle_id: WHEELED, component_type: "engine" },
      { shop_id: SHOP, installed_vehicle_id: HIDDEN, component_type: "track_chain" },
    ],
  };
  return {
    log,
    supabase: fakeClient(tables, log, "scoped") as never,
    admin: fakeClient(tables, log, "admin") as never,
  };
}

describe("loadEquipmentAssetList", () => {
  it("lists visible assets without any history reads", async () => {
    const env = setup();
    const { rows } = await loadEquipmentAssetList({ ...env, shopId: SHOP });
    expect(rows.map((row) => row.assetId)).toEqual([TRACKED, WHEELED]);
    expect(rows[0]).toMatchObject({ unitNumber: "EX-1", customerName: "Granite Co", siteName: "North pit" });
    for (const table of ["work_orders", "inspections", "bookings", "equipment_pm_plans"]) {
      expect(env.log.some((entry) => entry.endsWith(`:${table}`))).toBe(false);
    }
    expect(env.log).not.toContain("admin:equipment_components");
  });

  it("keeps only visible machines that have undercarriage components", async () => {
    const env = setup();
    const { rows } = await loadEquipmentAssetList({ ...env, shopId: SHOP, requireUndercarriage: true });
    // Wheeled has no undercarriage part; Hidden has one but is not visible through RLS.
    expect(rows.map((row) => row.assetId)).toEqual([TRACKED]);
  });
});
