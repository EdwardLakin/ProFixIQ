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
        is: (column: string, value: unknown) => {
          filters.push((row) => (row[column] ?? null) === value);
          return builder;
        },
        gte: (column: string, value: string) => {
          filters.push((row) => String(row[column]) >= value);
          return builder;
        },
        order: () => builder,
        // A referenced-table limit applies to embedded rows, not to this table.
        limit: (count: number, options?: { referencedTable?: string }) => {
          if (!options?.referencedTable) max = count;
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
  it("reads profiles and PM plans with the admin client and every operational fact through the caller's client", async () => {
    const env = setup();
    await loadEquipmentDirectory({ ...env, shopId: SHOP, role: "owner", now: NOW });
    // Equipment PM plans have no client grants; completions are read only when plans exist.
    expect(env.log.filter((entry) => entry.startsWith("admin:"))).toEqual([
      "admin:equipment_asset_profiles",
      "admin:equipment_pm_plans",
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

  describe("Equipment PM plans in the PM column", () => {
    function plan(id: string, vehicleId: string, patch: Row = {}): Row {
      return {
        id,
        shop_id: SHOP,
        vehicle_id: vehicleId,
        name: "PM",
        instructions: null,
        interval_hours: null,
        interval_distance: null,
        distance_unit: null,
        interval_cycles: null,
        interval_days: 30,
        start_date: "2026-08-01",
        start_hours: null,
        start_distance: null,
        start_cycles: null,
        active: true,
        version: 1,
        created_by: null,
        created_at: "2026-08-01T00:00:00Z",
        updated_by: null,
        updated_at: "2026-08-01T00:00:00Z",
        ...patch,
      };
    }
    function completion(id: string, planId: string, vehicleId: string, patch: Row = {}): Row {
      return {
        id,
        shop_id: SHOP,
        sequence: 1,
        plan_id: planId,
        vehicle_id: vehicleId,
        completed_on: "2026-10-01",
        asset_hours: null,
        distance: null,
        distance_unit: null,
        cycles: null,
        work_order_id: null,
        notes: null,
        recorded_by: null,
        created_at: "2026-10-01T12:00:00Z",
        voided_at: null,
        voided_by: null,
        void_reason: null,
        ...patch,
      };
    }

    it("shows the more urgent of plans and service suggestions", async () => {
      // EX: suggestions overdue (2 items), plan done on Oct 1 (ok).
      // BUCKET: no suggestion evidence, calendar plan never done since Aug 1 (overdue).
      const env = setup({
        equipment_pm_plans: [
          plan("p-ex", EX, { equipment_pm_completions: [completion("c-ex", "p-ex", EX)] }),
          plan("p-bucket", BUCKET),
        ],
      });
      const { rows } = await loadEquipmentDirectory({ ...env, shopId: SHOP, role: "owner", now: NOW });
      expect(rows.find((row) => row.assetId === EX)?.pm).toEqual({ state: "overdue", dueCount: 2 });
      expect(rows.find((row) => row.assetId === BUCKET)?.pm).toEqual({ state: "overdue", dueCount: 1 });
      // The latest completion is embedded in the plan read; history is never scanned.
      expect(env.log).not.toContain("admin:equipment_pm_completions");
    });

    it("evaluates distance plans against the odometer the row displays", async () => {
      // EX shows the newest work-order reading (812 km), not the vehicle's 500 mi (≈ 804.7 km).
      // Due at 900 km: 88 km left is within 10 % of 890 → due; the vehicle value would read ok.
      const env = setup({
        equipment_pm_plans: [
          plan("p-dist", EX, {
            interval_days: null,
            interval_distance: 890,
            distance_unit: "km",
            start_distance: 10,
          }),
        ],
      });
      const { rows } = await loadEquipmentDirectory({ ...env, shopId: SHOP, role: "owner", now: NOW });
      const ex = rows.find((row) => row.assetId === EX)!;
      expect(ex.odometer).toBe("812");
      expect(ex.pm).toEqual({ state: "overdue", dueCount: 3 });
    });

    it("lets an up-to-date plan replace 'not evaluated' and ignores voided completions and archived plans", async () => {
      const env = setup({
        equipment_pm_plans: [
          plan("p-bucket", BUCKET, {
            equipment_pm_completions: [
              completion("c-void", "p-bucket", BUCKET, {
                completed_on: "2026-10-10",
                voided_at: "2026-10-11T00:00:00Z",
                void_reason: "Wrong unit",
              }),
              completion("c-ok", "p-bucket", BUCKET, { completed_on: "2026-10-01" }),
            ],
          }),
          plan("p-archived", BUCKET, { active: false, start_date: "2020-01-01" }),
        ],
      });
      const { rows } = await loadEquipmentDirectory({ ...env, shopId: SHOP, role: "owner", now: NOW });
      expect(rows.find((row) => row.assetId === BUCKET)?.pm).toEqual({ state: "ok", dueCount: 0 });
    });

    it("never reads plans for assets the caller cannot see", async () => {
      const env = setup({ equipment_pm_plans: [plan("p-hidden", HIDDEN, { start_date: "2020-01-01" })] });
      const { rows } = await loadEquipmentDirectory({ ...env, shopId: SHOP, role: "owner", now: NOW });
      expect(rows.map((row) => row.assetId)).not.toContain(HIDDEN);
      expect(rows.every((row) => row.pm.state !== "overdue" || row.assetId === EX)).toBe(true);
    });

    it("pages through every active plan instead of stopping at one page", async () => {
      // 1,000 up-to-date plans fill the first page; the overdue one is on the second.
      const many = Array.from({ length: 1_000 }, (_, index) =>
        plan(`p-${String(index).padStart(4, "0")}`, BUCKET, {
          equipment_pm_completions: [completion(`c-${index}`, `p-${index}`, BUCKET)],
        }),
      );
      const env = setup({ equipment_pm_plans: [...many, plan("p-overdue", BUCKET)] });
      const { rows } = await loadEquipmentDirectory({ ...env, shopId: SHOP, role: "owner", now: NOW });
      expect(rows.find((row) => row.assetId === BUCKET)?.pm).toEqual({ state: "overdue", dueCount: 1 });
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

  it("derives open work, inspection state and role-gated quick actions from the same evidence", async () => {
    const env = setup();
    const { rows } = await loadEquipmentDirectory({ ...env, shopId: SHOP, role: "owner", now: NOW });

    const ex = rows.find((row) => row.assetId === EX)!;
    expect(ex.customerId).toBe("cust-1");
    // Only the in-progress order is open; completed and paid orders are not.
    expect(ex.openWorkOrderCount).toBe(1);
    expect(ex.inspection.state).toBe("findings");
    expect(ex.actions.recordMeterHref).toBe(`/equipment/${EX}#asset-meters`);
    expect(ex.actions.createWorkOrderHref).toBe(
      `/work-orders/create?autostart=1&customerId=cust-1&vehicleId=${EX}`,
    );

    const bucket = rows.find((row) => row.assetId === BUCKET)!;
    expect(bucket).toMatchObject({ customerId: null, openWorkOrderCount: 0 });
    expect(bucket.inspection.state).toBe("none");
    // The canonical create flow needs an account; no account, no shortcut.
    expect(bucket.actions.createWorkOrderHref).toBeNull();
  });

  it("hides quick actions from roles that may not create work or record readings", async () => {
    const env = setup();
    const { rows } = await loadEquipmentDirectory({ ...env, shopId: SHOP, role: "parts", now: NOW });
    const ex = rows.find((row) => row.assetId === EX)!;
    expect(ex.actions).toEqual({ createWorkOrderHref: null, recordMeterHref: null });
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

describe("equipmentNeedsAttention", () => {
  it("flags overdue/due PM, downed machines and failed findings only", async () => {
    const { equipmentNeedsAttention } = await import("@/features/equipment/lib/equipmentDirectory");
    const base = { pm: { state: "ok" as const }, operatingStatus: "operational" as const, openDefects: { failed: 0 } };
    expect(equipmentNeedsAttention(base)).toBe(false);
    expect(equipmentNeedsAttention({ ...base, pm: { state: "overdue" } })).toBe(true);
    expect(equipmentNeedsAttention({ ...base, pm: { state: "due" } })).toBe(true);
    expect(equipmentNeedsAttention({ ...base, pm: { state: "not_evaluated" } })).toBe(false);
    expect(equipmentNeedsAttention({ ...base, operatingStatus: "down" })).toBe(true);
    expect(equipmentNeedsAttention({ ...base, openDefects: { failed: 1 } })).toBe(true);
  });
});
