import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadEquipmentDirectory } from "@/features/equipment/server/loadEquipmentDirectory";

const SHOP = "00000000-0000-4000-8000-000000000111";
const EX = "00000000-0000-4000-8000-000000000001";
const BUCKET = "00000000-0000-4000-8000-000000000002";
const HIDDEN = "00000000-0000-4000-8000-000000000003";
const NOW = new Date("2026-10-12T12:00:00Z");

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

/** Chainable Supabase fake: eq / in / gte filters, order, limit; thenable. */
function fakeClient(tables: Tables, log: string[], name: string) {
  return {
    from(table: string) {
      log.push(`${name}:${table}`);
      const filters: Array<(row: Row) => boolean> = [];
      let max = Infinity;
      let offset = 0;
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
        gte: (column: string, value: string) => {
          filters.push((row) => String(row[column]) >= value);
          return builder;
        },
        order: () => builder,
        limit: (count: number) => {
          max = count;
          return builder;
        },
        range: (from: number, to: number) => {
          offset = from;
          max = to - from + 1;
          return builder;
        },
        then: (resolve: (value: unknown) => void) =>
          resolve({
            data: (tables[table] ?? [])
              .filter((row) => filters.every((filter) => filter(row)))
              .slice(offset, offset + max),
            error: null,
          }),
      };
      return builder;
    },
  };
}

function profile(vehicleId: string, patch: Row = {}): Row {
  return {
    vehicle_id: vehicleId,
    shop_id: SHOP,
    equipment_class: "crawler_excavator",
    equipment_family: "excavation",
    serial_number: "CAT0336",
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
    created_at: "2026-10-01T00:00:00Z",
    created_by: null,
    updated_at: "2026-10-10T00:00:00Z",
    updated_by: null,
    ...patch,
  };
}

function workOrder(
  id: string,
  vehicleId: string,
  status: string,
  updatedAt: string,
  patch: Row = {},
): Row {
  return {
    id,
    custom_id: id.toUpperCase(),
    status,
    record_type: "work_order",
    approval_state: null,
    estimate_number: null,
    estimate_status: null,
    customer_id: null,
    vehicle_id: vehicleId,
    shop_id: SHOP,
    odometer_km: null,
    scheduled_at: null,
    picked_up_at: null,
    created_at: updatedAt,
    updated_at: updatedAt,
    ...patch,
  };
}

function dueItem(patch: Row = {}): Row {
  return {
    serviceCode: "engine_oil",
    label: "Engine oil and filter",
    dueNow: true,
    overdue: false,
    isCritical: false,
    suppressed: false,
    whyDue: "500 h since last change",
    ...patch,
  };
}

function setup(extra: Partial<Tables> = {}) {
  const tables: Tables = {
    equipment_asset_profiles: [
      profile(EX),
      profile(BUCKET, {
        equipment_class: "attachment",
        equipment_family: "attachments",
        primary_meter: "none",
        mounted_on_vehicle_id: EX,
      }),
      // Profile whose vehicle the caller cannot see through RLS.
      profile(HIDDEN),
    ],
    vehicles: [
      {
        id: EX,
        shop_id: SHOP,
        customer_id: "cust-1",
        year: 2021,
        make: "Caterpillar",
        model: "336",
        unit_number: "EX-1",
        engine_hours: 4210,
        mileage: "500",
        odometer_unit: "mi",
        last_service_date: null,
      },
      {
        id: BUCKET,
        shop_id: SHOP,
        customer_id: null,
        year: null,
        make: "Caterpillar",
        model: "Bucket",
        unit_number: "BKT-1",
        engine_hours: null,
        mileage: null,
        odometer_unit: null,
        last_service_date: "2026-01-05",
      },
    ],
    customers: [{ id: "cust-1", shop_id: SHOP, business_name: "Granite Co" }],
    work_orders: [
      workOrder("wo-active", EX, "in_progress", "2026-10-11T00:00:00Z", { odometer_km: 812 }),
      workOrder("wo-done", EX, "completed", "2026-09-01T00:00:00Z", {
        picked_up_at: "2026-09-03T15:00:00Z",
      }),
      // Older job invoiced/edited recently: must not become "last service".
      workOrder("wo-old", EX, "paid", "2026-03-01T00:00:00Z", {
        updated_at: "2026-10-09T00:00:00Z",
      }),
    ],
    inspections: [
      // Older completed canonical inspection: superseded by insp-1.
      {
        id: "insp-0",
        vehicle_id: EX,
        shop_id: SHOP,
        work_order_id: null,
        status: "completed",
        completed: true,
        is_canonical: true,
        finalized_at: "2026-08-01T00:00:00Z",
        updated_at: "2026-08-01T00:00:00Z",
        created_at: "2026-08-01T00:00:00Z",
        summary: { items: [{ item: "Old finding", status: "fail" }] },
      },
      // Newer draft: not completed, must be ignored.
      {
        id: "insp-draft",
        vehicle_id: EX,
        shop_id: SHOP,
        work_order_id: null,
        status: "in_progress",
        completed: false,
        is_canonical: true,
        finalized_at: null,
        updated_at: "2026-10-11T12:00:00Z",
        created_at: "2026-10-11T12:00:00Z",
        summary: { items: [{ item: "Draft finding", status: "fail" }] },
      },
      {
        id: "insp-1",
        vehicle_id: EX,
        shop_id: SHOP,
        work_order_id: null,
        status: "completed",
        completed: true,
        is_canonical: true,
        finalized_at: "2026-10-05T00:00:00Z",
        updated_at: "2026-10-05T00:00:00Z",
        created_at: "2026-10-05T00:00:00Z",
        summary: {
          items: [
            { item: "Track shoe wear", status: "fail" },
            { item: "Bucket teeth", status: "recommend" },
            { item: "Lights", status: "ok" },
          ],
        },
      },
    ],
    bookings: [
      {
        id: "bk-1",
        vehicle_id: EX,
        shop_id: SHOP,
        status: "scheduled",
        starts_at: "2026-10-20T08:00:00Z",
        ends_at: "2026-10-20T10:00:00Z",
      },
    ],
    maintenance_suggestions: [
      {
        work_order_id: "wo-active",
        vehicle_id: EX,
        status: "ready",
        suggestions: [dueItem(), dueItem({ serviceCode: "hyd_filter", label: "Hydraulic filter", overdue: true })],
        created_at: "2026-10-11T00:00:00Z",
        updated_at: "2026-10-11T01:00:00Z",
        error_message: null,
        mileage_km: null,
      },
    ],
    work_order_lines: [
      {
        id: "line-1",
        work_order_id: "wo-active",
        shop_id: SHOP,
        created_at: "2026-10-10T00:00:00Z",
        updated_at: "2026-10-10T00:00:00Z",
      },
    ],
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

describe("loadEquipmentDirectory", () => {
  it("reads profiles with the admin client and every operational fact through the caller's client", async () => {
    const env = setup();
    await loadEquipmentDirectory({ ...env, shopId: SHOP, role: "owner", now: NOW });
    expect(env.log.filter((entry) => entry.startsWith("admin:"))).toEqual([
      "admin:equipment_asset_profiles",
    ]);
    expect(env.log).toContain("scoped:vehicles");
    expect(env.log).toContain("scoped:work_orders");
    expect(env.log).toContain("scoped:inspections");
  });

  it("builds the operational row from canonical workspace evidence", async () => {
    const env = setup();
    const { rows, truncated } = await loadEquipmentDirectory({ ...env, shopId: SHOP, role: "owner", now: NOW });
    expect(truncated).toBe(false);

    const ex = rows.find((row) => row.assetId === EX)!;
    expect(ex).toMatchObject({
      href: `/equipment/${EX}`,
      unitNumber: "EX-1",
      equipmentClassLabel: "Crawler excavator",
      serialNumber: "CAT0336",
      engineHours: 4210,
      customerName: "Granite Co",
      siteName: "North pit",
      operatingStatus: "operational",
      // Latest completed canonical inspection only (not the older one or the draft).
      openDefects: { total: 2, failed: 1 },
      pm: { state: "overdue", dueCount: 2 },
      // Ordered by immutable intake time, shown as the recorded pickup.
      lastServiceAt: "2026-09-03T15:00:00Z",
      // Dated work-order reading wins over the undated vehicle value, like the workspace.
      odometer: "812",
      odometerUnit: "km",
      nextService: { startsAt: "2026-10-20T08:00:00Z", status: "scheduled" },
    });
    expect(ex.activeWorkOrder?.href).toBe("/work-orders/wo-active");

    const bucket = rows.find((row) => row.assetId === BUCKET)!;
    expect(bucket).toMatchObject({
      mountedOnAssetId: EX,
      openDefects: { total: 0, failed: 0 },
      pm: { state: "not_evaluated", dueCount: 0 },
      lastServiceAt: "2026-01-05",
      activeWorkOrder: null,
      nextService: null,
    });
  });

  it("never lists an asset the caller cannot see through RLS", async () => {
    const env = setup();
    const { rows } = await loadEquipmentDirectory({ ...env, shopId: SHOP, role: "owner", now: NOW });
    expect(rows.map((row) => row.assetId)).not.toContain(HIDDEN);
  });

  it("reports PM as not evaluated when the maintenance evidence is stale", async () => {
    const env = setup({
      work_order_lines: [
        {
          id: "line-1",
          work_order_id: "wo-active",
          shop_id: SHOP,
          created_at: "2026-10-10T00:00:00Z",
          // Edited after the suggestion was computed.
          updated_at: "2026-10-11T05:00:00Z",
        },
      ],
    });
    const { rows } = await loadEquipmentDirectory({ ...env, shopId: SHOP, role: "owner", now: NOW });
    expect(rows.find((row) => row.assetId === EX)?.pm).toEqual({
      state: "not_evaluated",
      dueCount: 0,
    });
  });

  it("returns an empty directory without operational queries when no profiles exist", async () => {
    const env = setup({ equipment_asset_profiles: [] });
    const directory = await loadEquipmentDirectory({ ...env, shopId: SHOP, role: "owner", now: NOW });
    expect(directory).toEqual({ rows: [], truncated: false });
    expect(env.log).toEqual(["admin:equipment_asset_profiles"]);
  });

  it("scopes profiles to the caller's shop", async () => {
    const env = setup({
      equipment_asset_profiles: [profile(EX, { shop_id: "other-shop" })],
    });
    const { rows } = await loadEquipmentDirectory({ ...env, shopId: SHOP, role: "owner", now: NOW });
    expect(rows).toEqual([]);
  });

  it("omits the active work order link for roles that cannot open it", async () => {
    const env = setup();
    const { rows } = await loadEquipmentDirectory({ ...env, shopId: SHOP, role: "parts", now: NOW });
    expect(rows.find((row) => row.assetId === EX)?.activeWorkOrder).toMatchObject({
      title: expect.any(String),
      href: null,
    });
  });

  it("pages evidence past the API row cap", async () => {
    const many = Array.from({ length: 2_300 }, (_, index) =>
      workOrder(`wo-${String(index).padStart(5, "0")}`, EX, "cancelled", "2025-01-01T00:00:00Z"),
    );
    // The single active job sorts last by id, beyond the first two 1,000-row pages.
    many.push(workOrder("wo-zzzzz", EX, "in_progress", "2026-10-11T00:00:00Z"));
    const env = setup({ work_orders: many, maintenance_suggestions: [], work_order_lines: [] });
    const { rows } = await loadEquipmentDirectory({ ...env, shopId: SHOP, role: "owner", now: NOW });
    expect(rows.find((row) => row.assetId === EX)?.activeWorkOrder?.href).toBe(
      "/work-orders/wo-zzzzz",
    );
  });
});
