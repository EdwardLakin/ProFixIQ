import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ASSET_LIST_WINDOW, loadEquipmentAssetList } from "@/features/equipment/server/loadEquipmentAssetList";

const SHOP = "00000000-0000-4000-8000-000000000111";
const TRACKED = "00000000-0000-4000-8000-000000000001";
const WHEELED = "00000000-0000-4000-8000-000000000002";
const HIDDEN = "00000000-0000-4000-8000-000000000003";

type Row = Record<string, unknown>;

/** PostgREST caps every response at `max_rows` (supabase/config.toml). */
const MAX_ROWS = 1000;

function fakeClient(tables: Record<string, Row[]>, log: string[], name: string) {
  return {
    from(table: string) {
      log.push(`${name}:${table}`);
      const filters: Array<(row: Row) => boolean> = [];
      const orders: Array<{ column: string; ascending: boolean }> = [];
      let max = MAX_ROWS;
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
        gt: (column: string, value: string) => {
          filters.push((row) => String(row[column]) > value);
          return builder;
        },
        // Only the keyset the loader sends: strictly after (updated_at, vehicle_id) descending.
        or: (expression: string) => {
          const match = /updated_at\.lt\."([^"]+)",and\(updated_at\.eq\."([^"]+)",vehicle_id\.lt\.([^)]+)\)/.exec(expression);
          if (!match) throw new Error(`unsupported filter: ${expression}`);
          const [, before, same, id] = match;
          filters.push(
            (row) =>
              String(row.updated_at) < before ||
              (String(row.updated_at) === same && String(row.vehicle_id) < id),
          );
          return builder;
        },
        order: (column: string, options?: { ascending?: boolean }) => {
          orders.push({ column, ascending: options?.ascending !== false });
          return builder;
        },
        limit: (count: number) => {
          max = Math.min(count, MAX_ROWS);
          return builder;
        },
        then: (resolve: (value: unknown) => void) => {
          const rows = (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
          for (const { column, ascending } of [...orders].reverse()) {
            rows.sort((x, y) => {
              const a = String(x[column]);
              const b = String(y[column]);
              return ascending ? a.localeCompare(b) : b.localeCompare(a);
            });
          }
          resolve({ data: rows.slice(0, max), error: null });
        },
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
    equipment_asset_profiles: [
      profile(TRACKED, { updated_at: "2026-03-01T00:00:00Z" }),
      profile(WHEELED, { updated_at: "2026-05-01T00:00:00Z" }),
      profile(HIDDEN, { updated_at: "2026-04-01T00:00:00Z" }),
    ],
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
  it("lists visible assets newest-updated first, without any history reads", async () => {
    const env = setup();
    const { rows, capped } = await loadEquipmentAssetList({ ...env, shopId: SHOP });
    // WHEELED was updated after TRACKED; HIDDEN is not visible through RLS.
    expect(rows.map((row) => row.assetId)).toEqual([WHEELED, TRACKED]);
    expect(capped).toBe(false);
    expect(rows[1]).toMatchObject({
      unitNumber: "EX-1",
      customerId: "cust-1",
      customerName: "Granite Co",
      siteName: "North pit",
      equipmentClass: "crawler_excavator",
      operatingStatus: "operational",
      updatedAt: "2026-03-01T00:00:00Z",
    });
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

  it("reads every window by immutable vehicle id and returns the same list", async () => {
    const whole = await loadEquipmentAssetList({ ...setup(), shopId: SHOP });
    const env = setup();
    const windowed = await loadEquipmentAssetList({ ...env, shopId: SHOP, windowSize: 1 });
    expect(windowed).toEqual(whole);
    expect(env.log.filter((entry) => entry === "admin:equipment_asset_profiles").length).toBeGreaterThan(1);
  });

  it("stops at the scan limit and says the list is capped", async () => {
    const { rows, capped } = await loadEquipmentAssetList({
      ...setup(),
      shopId: SHOP,
      windowSize: 1,
      maxAssets: 1,
    });
    expect(capped).toBe(true);
    expect(rows.length).toBeLessThan(2);
  });

  it("keeps the newest assets when the shop exceeds the cap, whatever their ids", async () => {
    // Ids are the reverse of recency, so an id-ordered cap would keep the wrong two.
    const ids = ["00000000-0000-4000-8000-0000000000a1", "00000000-0000-4000-8000-0000000000a2", "00000000-0000-4000-8000-0000000000a3", "00000000-0000-4000-8000-0000000000a4"];
    const tables = {
      equipment_asset_profiles: ids.map((id, i) => profile(id, { updated_at: `2026-0${4 - i}-01T00:00:00Z` })),
      vehicles: ids.map((id) => ({ id, shop_id: SHOP, customer_id: null, year: null, make: "Cat", model: "X", unit_number: id.slice(-2) })),
    };
    const log: string[] = [];
    const { rows, capped } = await loadEquipmentAssetList({
      supabase: fakeClient(tables, log, "scoped") as never,
      admin: fakeClient(tables, log, "admin") as never,
      shopId: SHOP,
      windowSize: 1,
      maxAssets: 2,
    });
    // a1 is the newest (April), a2 next (March); a3 and a4 are the oldest and dropped.
    expect(rows.map((row) => row.assetId)).toEqual([ids[0], ids[1]]);
    expect(capped).toBe(true);
  });

  it("lists every asset of a shop larger than the API row cap", async () => {
    const count = 1_200;
    const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const tables = {
      equipment_asset_profiles: Array.from({ length: count }, (_, n) =>
        profile(id(n + 1), { updated_at: new Date(Date.UTC(2026, 0, 1) + n * 60_000).toISOString() }),
      ),
      vehicles: Array.from({ length: count }, (_, n) => ({
        id: id(n + 1), shop_id: SHOP, customer_id: null, year: null, make: "Cat", model: "X", unit_number: `U-${n + 1}`,
      })),
    };
    const log: string[] = [];
    // The default window, with a server that never returns more than 1,000 rows.
    const { rows, capped } = await loadEquipmentAssetList({
      supabase: fakeClient(tables, log, "scoped") as never,
      admin: fakeClient(tables, log, "admin") as never,
      shopId: SHOP,
    });
    expect(rows).toHaveLength(count);
    expect(new Set(rows.map((row) => row.assetId)).size).toBe(count);
    expect(capped).toBe(false);
    // Newest first.
    expect(rows[0].unitNumber).toBe(`U-${count}`);
  });

  it("asks for a window plus its lookahead row that the API row cap can actually return", () => {
    expect(ASSET_LIST_WINDOW + 1).toBeLessThanOrEqual(MAX_ROWS);
  });
});

