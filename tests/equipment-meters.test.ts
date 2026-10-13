import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/equipment/server/equipmentAssetProfileService", () => ({
  authorizeEquipmentAsset: mocks.authorize,
  EquipmentAssetProfileError: class extends Error {},
}));

import {
  buildMeterTimeline,
  meterUsageRate,
  meterUsageRates,
  metersInTimeline,
  projectPmDue,
  validateMeterReading,
  type MeterReading,
  type MeterTimelineEntry,
  type MeterUsageRates,
} from "@/features/equipment/lib/meters";
import { evaluatePmPlan, type PmCompletion, type PmMeters, type PmPlan } from "@/features/equipment/lib/pm";
import {
  EquipmentMeterError,
  loadAssetMeters,
  recordMeterReading,
  voidMeterReading,
} from "@/features/equipment/server/equipmentMeterService";

const NOW = Date.parse("2026-10-13T15:00:00Z");
const SHOP = "00000000-0000-4000-8000-000000000001";
const ASSET = "00000000-0000-4000-8000-000000000002";
const USER = "00000000-0000-4000-8000-000000000003";
const PLAN = "00000000-0000-4000-8000-000000000004";
const READING = "00000000-0000-4000-8000-000000000005";
const WO = "00000000-0000-4000-8000-000000000006";
const KEY = "00000000-0000-4000-8000-0000000000aa";

function reading(id: string, readAt: string, values: Partial<MeterReading> = {}): MeterReading {
  return {
    id,
    readAt,
    engineHours: null,
    odometer: null,
    cycles: null,
    source: "manual",
    notes: null,
    recordedBy: USER,
    createdAt: readAt,
    voided: null,
    ...values,
  };
}

function timelineOf(readings: MeterReading[]): MeterTimelineEntry[] {
  return buildMeterTimeline({ readings, completions: [], workOrders: [] });
}

const basePlan: PmPlan = {
  id: PLAN,
  assetId: ASSET,
  name: "250-hour service",
  instructions: null,
  intervalHours: 250,
  intervalDistance: null,
  distanceUnit: null,
  intervalCycles: null,
  intervalDays: null,
  startDate: "2026-09-01",
  startHours: 2300,
  startDistance: null,
  startCycles: null,
  active: true,
  version: 1,
  updatedAt: "2026-09-01T00:00:00Z",
};

const meters: PmMeters = { hours: 2450, distance: null, cycles: null, updatedAt: null, today: "2026-10-13" };

function okRates(partial: Partial<MeterUsageRates>): MeterUsageRates {
  const none = (meter: "hours" | "distance" | "cycles") =>
    ({ meter, status: "insufficient", unit: meter === "hours" ? "h" : meter === "cycles" ? "cycles" : "km", readings: 0 }) as const;
  return { hours: none("hours"), distance: none("distance"), cycles: none("cycles"), ...partial };
}

describe("meter timeline", () => {
  it("merges readings, PM completion meters and dated work-order odometers, newest first", () => {
    const completion: PmCompletion = {
      id: "c1",
      planId: PLAN,
      completedOn: "2026-09-20",
      assetHours: 2380,
      distance: null,
      distanceUnit: null,
      cycles: null,
      workOrder: { id: WO, label: "WO-1042", href: `/work-orders/${WO}` },
      notes: null,
      recordedBy: USER,
      createdAt: "2026-09-20T10:00:00Z",
      voided: null,
    };
    const timeline = buildMeterTimeline({
      readings: [reading("r1", "2026-10-01T08:00:00Z", { engineHours: 2420, source: "inspection" })],
      completions: [
        { completion, planName: "250-hour service" },
        // A completion without meters adds nothing to the timeline.
        { completion: { ...completion, id: "c0", assetHours: null }, planName: "Annual" },
      ],
      workOrders: [
        { id: WO, label: "WO-1042", href: `/work-orders/${WO}`, createdAt: "2026-09-10T00:00:00Z", odometerKm: 1200 },
        { id: "wo-none", label: "WO-1", href: null, createdAt: "2026-09-11T00:00:00Z", odometerKm: null },
      ],
    });
    expect(timeline.map((entry) => [entry.origin, entry.label, entry.at])).toEqual([
      ["reading", "During inspection", "2026-10-01T08:00:00Z"],
      ["pm_completion", "PM: 250-hour service", "2026-09-20T12:00:00.000Z"],
      ["work_order", "WO-1042", "2026-09-10T00:00:00Z"],
    ]);
    expect(timeline[0].readingId).toBe("r1");
    expect(timeline[1].href).toBe(`/work-orders/${WO}`);
    expect(timeline[2].distance).toEqual({ value: 1200, unit: "km" });
  });

  it("flags a value lower than the previous one without dropping it, and ignores voided values", () => {
    const timeline = timelineOf([
      reading("a", "2026-10-01T00:00:00Z", { engineHours: 100 }),
      reading("b", "2026-10-02T00:00:00Z", { engineHours: 90 }),
      reading("c", "2026-10-03T00:00:00Z", { engineHours: 50, voided: { at: "x", reason: "Misread" } }),
      reading("d", "2026-10-04T00:00:00Z", { engineHours: 95, cycles: 3 }),
    ]);
    const byId = new Map(timeline.map((entry) => [entry.readingId, entry]));
    expect(timeline).toHaveLength(4);
    expect(byId.get("b")?.backwards).toEqual(["hours"]);
    expect(byId.get("c")?.backwards).toEqual([]);
    // Compared with b (90), not the voided c (50).
    expect(byId.get("d")?.backwards).toEqual([]);
  });

  it("compares odometers across km and mi", () => {
    const timeline = timelineOf([
      reading("a", "2026-10-01T00:00:00Z", { odometer: { value: 100, unit: "mi" } }),
      // 150 km is less than 100 mi (160.9 km).
      reading("b", "2026-10-02T00:00:00Z", { odometer: { value: 150, unit: "km" } }),
      // 161 km is the same distance as 100 mi, rounded.
      reading("c", "2026-10-03T00:00:00Z", { odometer: { value: 161, unit: "km" } }),
    ]);
    const byId = new Map(timeline.map((entry) => [entry.readingId, entry.backwards]));
    expect(byId.get("b")).toEqual(["distance"]);
    expect(byId.get("c")).toEqual([]);
    expect(metersInTimeline(timeline)).toEqual(["distance"]);
  });
});

describe("usage rate", () => {
  it("is (latest − earliest) / days over the window", () => {
    const timeline = timelineOf([
      reading("a", "2026-07-01T00:00:00Z", { engineHours: 1000 }), // outside 90 days
      reading("b", "2026-09-13T15:00:00Z", { engineHours: 2000 }),
      reading("c", "2026-09-28T15:00:00Z", { engineHours: 2020 }),
      reading("d", "2026-10-13T15:00:00Z", { engineHours: 2060 }),
    ]);
    expect(meterUsageRate(timeline, "hours", { now: NOW })).toMatchObject({
      status: "ok",
      perDay: 2,
      unit: "h",
      days: 30,
      readings: 3,
      from: { value: 2000 },
      to: { value: 2060 },
    });
  });

  it("needs two values at least a day apart", () => {
    expect(meterUsageRate(timelineOf([reading("a", "2026-10-10T00:00:00Z", { cycles: 5 })]), "cycles", { now: NOW })).toEqual({
      meter: "cycles",
      status: "insufficient",
      unit: "cycles",
      readings: 1,
    });
    const sameDay = timelineOf([
      reading("a", "2026-10-10T08:00:00Z", { cycles: 5 }),
      reading("b", "2026-10-10T17:00:00Z", { cycles: 9 }),
    ]);
    expect(meterUsageRate(sameDay, "cycles", { now: NOW }).status).toBe("insufficient");
    expect(meterUsageRate(timelineOf([]), "hours", { now: NOW }).status).toBe("insufficient");
  });

  it("does not count voided readings", () => {
    const timeline = timelineOf([
      reading("a", "2026-10-01T00:00:00Z", { engineHours: 100 }),
      reading("b", "2026-10-11T00:00:00Z", { engineHours: 900, voided: { at: "x", reason: "Typo" } }),
    ]);
    expect(meterUsageRate(timeline, "hours", { now: NOW }).status).toBe("insufficient");
  });

  it("reports a decrease instead of a rate", () => {
    const timeline = timelineOf([
      reading("a", "2026-10-01T00:00:00Z", { engineHours: 100 }),
      reading("b", "2026-10-11T00:00:00Z", { engineHours: 80 }),
    ]);
    expect(meterUsageRate(timeline, "hours", { now: NOW })).toMatchObject({
      status: "decreasing",
      from: { value: 100 },
      to: { value: 80 },
    });
  });

  it("converts mixed km/mi odometer values into the requested unit", () => {
    const timeline = timelineOf([
      reading("a", "2026-10-01T00:00:00Z", { odometer: { value: 100, unit: "mi" } }),
      reading("b", "2026-10-11T00:00:00Z", { odometer: { value: 321.9, unit: "km" } }),
    ]);
    const km = meterUsageRate(timeline, "distance", { now: NOW, distanceUnit: "km" });
    expect(km).toMatchObject({ status: "ok", unit: "km", from: { value: 160.9 } });
    expect(km.status === "ok" && km.perDay).toBeCloseTo(16.1, 1);
    const mi = meterUsageRate(timeline, "distance", { now: NOW, distanceUnit: "mi" });
    expect(mi.status === "ok" && mi.perDay).toBeCloseTo(10, 1);
    // Defaults to the newest odometer's unit.
    expect(meterUsageRates(timeline, { now: NOW }).distance.unit).toBe("km");
  });
});

describe("PM projections", () => {
  it("projects remaining hours at the usage rate from today", () => {
    const status = evaluatePmPlan(basePlan, [], meters); // due at 2550, 100 h left
    const [projection] = projectPmDue(
      [status],
      okRates({
        hours: { meter: "hours", status: "ok", perDay: 8, unit: "h", from: { at: "", value: 0 }, to: { at: "", value: 0 }, days: 30, readings: 3 },
      }),
      "2026-10-13",
    );
    expect(projection).toMatchObject({ planId: PLAN, planName: "250-hour service", date: "2026-10-26" });
    expect(projection.dimensions[0]).toMatchObject({ status: "projected", remaining: 100, perDay: 8, days: 13 });
  });

  it("converts the distance rate into the plan's unit and takes whichever comes first", () => {
    const plan: PmPlan = {
      ...basePlan,
      intervalHours: null,
      startHours: null,
      intervalDistance: 1000,
      distanceUnit: "mi",
      startDistance: 0,
      intervalDays: 90,
    };
    const status = evaluatePmPlan(plan, [], { ...meters, distance: { value: 800, unit: "mi" } }); // 200 mi left
    const [projection] = projectPmDue(
      [status],
      okRates({
        // 32.18688 km/day = 20 mi/day
        distance: { meter: "distance", status: "ok", perDay: 32.18688, unit: "km", from: { at: "", value: 0 }, to: { at: "", value: 0 }, days: 30, readings: 3 },
      }),
      "2026-10-13",
    );
    expect(projection.dimensions).toEqual([
      expect.objectContaining({ dimension: "distance", status: "projected", unit: "mi", perDay: 20, days: 10, date: "2026-10-23" }),
      expect.objectContaining({ dimension: "days", status: "calendar", date: "2026-11-30" }),
    ]);
    expect(projection.date).toBe("2026-10-23");
  });

  it("says why an interval cannot be projected and skips archived plans", () => {
    const insufficient = projectPmDue([evaluatePmPlan(basePlan, [], meters)], okRates({}), "2026-10-13");
    expect(insufficient[0]).toMatchObject({ date: null, dimensions: [expect.objectContaining({ status: "no_rate" })] });

    const idle = projectPmDue(
      [evaluatePmPlan(basePlan, [], meters)],
      okRates({ hours: { meter: "hours", status: "ok", perDay: 0, unit: "h", from: { at: "", value: 1 }, to: { at: "", value: 1 }, days: 5, readings: 2 } }),
      "2026-10-13",
    );
    expect(idle[0].dimensions[0].status).toBe("no_usage");

    const past = projectPmDue([evaluatePmPlan(basePlan, [], { ...meters, hours: 2600 })], okRates({}), "2026-10-13");
    expect(past[0]).toMatchObject({ date: "2026-10-13", dimensions: [expect.objectContaining({ status: "reached" })] });

    const unknown = projectPmDue([evaluatePmPlan(basePlan, [], { ...meters, hours: null })], okRates({}), "2026-10-13");
    expect(unknown[0].dimensions[0].status).toBe("unknown");

    expect(projectPmDue([evaluatePmPlan({ ...basePlan, active: false }, [], meters)], okRates({}), "2026-10-13")).toEqual([]);
  });
});

describe("meter reading validation", () => {
  it("requires at least one non-negative meter and a unit for the odometer", () => {
    expect(validateMeterReading({}, NOW)).toMatchObject({ ok: false, error: "Enter at least one meter (engine hours, odometer or cycles)." });
    expect(validateMeterReading({ engineHours: -1 }, NOW).ok).toBe(false);
    expect(validateMeterReading({ cycles: 1.5 }, NOW).ok).toBe(false);
    expect(validateMeterReading({ odometer: 100 }, NOW)).toMatchObject({ ok: false, error: "Select km or mi for the odometer." });
    expect(validateMeterReading({ engineHours: 1, source: "guess" }, NOW).ok).toBe(false);
    expect(validateMeterReading({ engineHours: 1, readAt: "2026-10-20" }, NOW)).toMatchObject({ ok: false, error: "Reading date cannot be in the future." });
    expect(validateMeterReading({ engineHours: 1, readAt: "nope" }, NOW).ok).toBe(false);
  });

  it("normalizes a valid reading", () => {
    expect(
      validateMeterReading(
        { engineHours: "2,410.55", odometer: "1250", odometerUnit: "Miles", cycles: "", readAt: "2026-10-01", source: "service", notes: " ok " },
        NOW,
      ),
    ).toEqual({
      ok: true,
      value: {
        readAt: "2026-10-01T12:00:00.000Z",
        engineHours: 2410.6,
        odometer: 1250,
        odometerUnit: "mi",
        cycles: null,
        source: "service",
        notes: "ok",
      },
    });
    expect(validateMeterReading({ cycles: 0 }, NOW)).toMatchObject({
      ok: true,
      value: { readAt: new Date(NOW).toISOString(), source: "manual", cycles: 0 },
    });
  });
});

type Tables = Record<string, Array<Record<string, unknown>>>;

function fakeClient(tables: Tables, rpcs: Array<{ name: string; args: Record<string, unknown> }> = [], rpcError: unknown = null) {
  return {
    from(table: string) {
      const filters: Array<(row: Record<string, unknown>) => boolean> = [];
      let slice: [number, number] | null = null;
      const rows = () => (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters.push((row) => row[column] === value);
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        range: (from: number, to: number) => {
          slice = [from, to + 1];
          return builder;
        },
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (resolve: (value: unknown) => void) =>
          resolve({ data: rows().slice(...(slice ?? [0, undefined])), error: null }),
      };
      return builder;
    },
    async rpc(name: string, args: Record<string, unknown>) {
      rpcs.push({ name, args });
      return rpcError ? { data: null, error: rpcError } : { data: { id: "new-id" }, error: null };
    },
  };
}

const identity = { id: ASSET, engineHours: 2450, odometer: null, odometerUnit: null };

const readingRow = {
  id: READING,
  shop_id: SHOP,
  sequence: 1,
  vehicle_id: ASSET,
  read_at: "2026-09-13T15:00:00Z",
  engine_hours: 2210,
  odometer: null,
  odometer_unit: null,
  cycles: null,
  source: "manual",
  notes: null,
  recorded_by: USER,
  created_at: "2026-09-13T15:00:00Z",
  voided_at: null,
  voided_by: null,
  void_reason: null,
};

const planRow = {
  id: PLAN,
  shop_id: SHOP,
  vehicle_id: ASSET,
  name: "250-hour service",
  instructions: null,
  interval_hours: 250,
  interval_distance: null,
  distance_unit: null,
  interval_cycles: null,
  interval_days: null,
  start_date: "2026-09-01",
  start_hours: 2300,
  start_distance: null,
  start_cycles: null,
  active: true,
  version: 1,
  created_by: USER,
  created_at: "2026-09-01T00:00:00Z",
  updated_by: USER,
  updated_at: "2026-09-01T00:00:00Z",
};

describe("meter service", () => {
  beforeEach(() => {
    mocks.authorize.mockReset();
  });

  it("loads the shop-scoped history, usage rate and PM projection", async () => {
    mocks.authorize.mockResolvedValue(identity);
    const result = await loadAssetMeters({
      supabase: fakeClient({
        work_orders: [
          { id: WO, shop_id: SHOP, vehicle_id: ASSET, custom_id: "1042", status: "completed", record_type: "work_order", created_at: "2026-10-01T00:00:00Z", odometer_km: 1500 },
        ],
      }) as never,
      admin: fakeClient({
        equipment_pm_plans: [planRow],
        equipment_meter_readings: [
          readingRow,
          { ...readingRow, id: "r2", sequence: 2, read_at: "2026-10-13T15:00:00Z", engine_hours: 2450 },
          // Another shop's reading for the same asset id is never read.
          { ...readingRow, id: "r3", shop_id: "other-shop", engine_hours: 9999 },
        ],
      }) as never,
      shopId: SHOP,
      role: "mechanic",
      assetId: ASSET,
      now: NOW,
    });
    expect(result?.timeline.map((entry) => entry.key)).toEqual([`reading:r2`, `wo:${WO}`, `reading:${READING}`]);
    expect(result?.timeline[1]).toMatchObject({ label: "WO-1042", href: `/work-orders/${WO}` });
    expect(result?.rates.hours).toMatchObject({ status: "ok", perDay: 8 });
    expect(result?.rates.distance.status).toBe("insufficient");
    expect(result?.projections[0]).toMatchObject({ planId: PLAN, date: "2026-10-26" });
    expect(result?.current.hours).toBe(2450);
  });

  it("returns null for an asset the caller cannot see", async () => {
    mocks.authorize.mockResolvedValue(null);
    expect(
      await loadAssetMeters({
        supabase: fakeClient({}) as never,
        admin: fakeClient({ equipment_meter_readings: [readingRow] }) as never,
        shopId: SHOP,
        role: "mechanic",
        assetId: ASSET,
      }),
    ).toBeNull();
  });

  it("records a validated reading through the RPC after authorizing the asset", async () => {
    mocks.authorize.mockResolvedValue(identity);
    const rpcs: Array<{ name: string; args: Record<string, unknown> }> = [];
    const result = await recordMeterReading({
      supabase: fakeClient({}) as never,
      admin: fakeClient({}, rpcs) as never,
      shopId: SHOP,
      role: "mechanic",
      actorUserId: USER,
      assetId: ASSET,
      body: { engineHours: 2460, readAt: "2026-10-13", operationKey: KEY },
      now: NOW,
    });
    expect(result).toEqual({ id: "new-id" });
    expect(rpcs).toEqual([
      {
        name: "equipment_meter_reading_record",
        args: {
          p_shop_id: SHOP,
          p_actor_user_id: USER,
          p_vehicle_id: ASSET,
          p_reading: {
            read_at: "2026-10-13T12:00:00.000Z",
            engine_hours: 2460,
            odometer: null,
            odometer_unit: null,
            cycles: null,
            source: "manual",
            notes: null,
          },
          p_operation_key: KEY,
        },
      },
    ]);
  });

  it("refuses roles, missing keys, invalid readings and unseen assets before writing", async () => {
    const rpcs: Array<{ name: string; args: Record<string, unknown> }> = [];
    const context = {
      supabase: fakeClient({}) as never,
      admin: fakeClient({}, rpcs) as never,
      shopId: SHOP,
      actorUserId: USER,
      assetId: ASSET,
      now: NOW,
    };
    await expect(recordMeterReading({ ...context, role: "parts", body: { engineHours: 1, operationKey: KEY } })).rejects.toMatchObject({ status: 403 });
    await expect(recordMeterReading({ ...context, role: "mechanic", body: { engineHours: 1 } })).rejects.toMatchObject({ status: 400 });
    await expect(recordMeterReading({ ...context, role: "mechanic", body: { operationKey: KEY } })).rejects.toMatchObject({ status: 400 });
    mocks.authorize.mockResolvedValue(null);
    await expect(recordMeterReading({ ...context, role: "mechanic", body: { engineHours: 1, operationKey: KEY } })).rejects.toMatchObject({ status: 404 });
    expect(rpcs).toEqual([]);
  });

  it("maps RPC failures", async () => {
    mocks.authorize.mockResolvedValue(identity);
    const context = {
      supabase: fakeClient({}) as never,
      shopId: SHOP,
      role: "manager" as const,
      actorUserId: USER,
      assetId: ASSET,
      body: { engineHours: 1, operationKey: KEY },
      now: NOW,
    };
    await expect(
      recordMeterReading({ ...context, admin: fakeClient({}, [], { code: "22023", message: "Operation key was already used" }) as never }),
    ).rejects.toMatchObject({ status: 400, message: "This request was already used for a different change. Reload and try again." });
    await expect(
      recordMeterReading({ ...context, admin: fakeClient({}, [], { code: "P0002", message: "Asset not found" }) as never }),
    ).rejects.toMatchObject({ status: 404 });
    const error = await recordMeterReading({ ...context, admin: fakeClient({}, [], { code: "XX000", message: "boom" }) as never }).catch((e) => e);
    expect(error).toBeInstanceOf(EquipmentMeterError);
    expect(error.status).toBe(500);
  });

  it("lets managers void a shop reading with a reason; others cannot", async () => {
    mocks.authorize.mockResolvedValue(identity);
    const rpcs: Array<{ name: string; args: Record<string, unknown> }> = [];
    const context = {
      supabase: fakeClient({}) as never,
      admin: fakeClient({ equipment_meter_readings: [readingRow] }, rpcs) as never,
      shopId: SHOP,
      actorUserId: USER,
    };
    await expect(
      voidMeterReading({ ...context, role: "mechanic", readingId: READING, body: { reason: "x", operationKey: KEY } }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      voidMeterReading({ ...context, role: "manager", readingId: READING, body: { reason: " ", operationKey: KEY } }),
    ).rejects.toMatchObject({ status: 400 });
    // A reading in another shop (or missing) is not found.
    await expect(
      voidMeterReading({ ...context, shopId: "other-shop", role: "manager", readingId: READING, body: { reason: "x", operationKey: KEY } }),
    ).rejects.toMatchObject({ status: 404 });
    expect(rpcs).toEqual([]);

    await voidMeterReading({ ...context, role: "manager", readingId: READING, body: { reason: " Misread ", operationKey: KEY } });
    expect(rpcs).toEqual([
      {
        name: "equipment_meter_reading_void",
        args: { p_shop_id: SHOP, p_actor_user_id: USER, p_reading_id: READING, p_reason: "Misread", p_operation_key: KEY },
      },
    ]);
  });
});
