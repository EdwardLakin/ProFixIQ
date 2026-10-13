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
  combinePmStates,
  evaluatePmPlan,
  lastCompletion,
  parseOdometer,
  pmIntervalSummary,
  validatePmCompletion,
  validatePmPlan,
  worstPmState,
  type PmCompletion,
  type PmMeters,
  type PmPlan,
} from "@/features/equipment/lib/pm";
import {
  loadAssetPm,
  recordPmCompletion,
  savePmPlan,
  voidPmCompletion,
} from "@/features/equipment/server/equipmentPmService";

const SHOP = "00000000-0000-4000-8000-000000000111";
const USER = "00000000-0000-4000-8000-000000000222";
const ASSET = "00000000-0000-4000-8000-000000000001";
const PLAN = "00000000-0000-4000-8000-0000000000b1";
const WO = "00000000-0000-4000-8000-0000000000c1";
const KEY = "00000000-0000-4000-8000-0000000000aa";
const NOW = Date.parse("2026-10-13T12:00:00Z");

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

const meters = (patch: Partial<PmMeters> = {}): PmMeters => ({
  hours: 2400,
  distance: null,
  cycles: null,
  updatedAt: null,
  today: "2026-10-13",
  ...patch,
});

function completion(patch: Partial<PmCompletion>): PmCompletion {
  return {
    id: "c1",
    planId: PLAN,
    completedOn: "2026-10-01",
    assetHours: 2500,
    distance: null,
    distanceUnit: null,
    cycles: null,
    workOrder: null,
    notes: null,
    recordedBy: USER,
    createdAt: "2026-10-01T12:00:00Z",
    voided: null,
    ...patch,
  };
}

describe("PM due arithmetic", () => {
  it("counts the hour interval from the starting point and reports what is left", () => {
    const status = evaluatePmPlan(basePlan, [], meters());
    expect(status.dimensions[0]).toMatchObject({ from: 2300, dueAt: 2550, current: 2400, remaining: 150, state: "ok" });
    expect(status.state).toBe("ok");
    // 10 % of the interval (25 h) or less left is due; past the point is overdue.
    expect(evaluatePmPlan(basePlan, [], meters({ hours: 2530 })).state).toBe("due");
    expect(evaluatePmPlan(basePlan, [], meters({ hours: 2551 })).state).toBe("overdue");
    expect(evaluatePmPlan(basePlan, [], meters({ hours: null })).state).toBe("not_evaluated");
  });

  it("counts from the latest completion that is not voided", () => {
    const completions = [
      completion({ id: "older", completedOn: "2026-09-20", assetHours: 2350 }),
      completion({ id: "voided", completedOn: "2026-10-05", assetHours: 2700, voided: { at: "x", reason: "Wrong unit" } }),
      completion({ id: "latest", completedOn: "2026-10-01", assetHours: 2390 }),
    ];
    expect(lastCompletion(completions)?.id).toBe("latest");
    const status = evaluatePmPlan(basePlan, completions, meters());
    expect(status.dimensions[0]).toMatchObject({ from: 2390, dueAt: 2640, remaining: 240 });
    expect(status.history.map((entry) => entry.id)).toEqual(["voided", "latest", "older"]);
  });

  it("is as urgent as its most urgent interval (whichever comes first)", () => {
    const plan = { ...basePlan, intervalDays: 30, startDate: "2026-09-01" };
    const status = evaluatePmPlan(plan, [], meters());
    expect(status.dimensions.map((entry) => entry.state)).toEqual(["ok", "overdue"]);
    expect(status.dimensions[1]).toMatchObject({ dueAt: "2026-10-01", remaining: -12 });
    expect(status.state).toBe("overdue");
    expect(worstPmState(["ok", "not_evaluated", "due"])).toBe("due");
    expect(worstPmState([])).toBe("not_evaluated");
  });

  it("converts distance between units and skips an odometer with an unknown unit", () => {
    const plan: PmPlan = {
      ...basePlan,
      intervalHours: null,
      startHours: null,
      intervalDistance: 5000,
      distanceUnit: "km",
      startDistance: 10000,
    };
    // 9,000 mi ≈ 14,484 km → 516 km left.
    const status = evaluatePmPlan(plan, [], meters({ distance: parseOdometer("9,000", "miles") }));
    expect(status.dimensions[0]).toMatchObject({ dueAt: 15000, current: 14484.1, remaining: 515.9, state: "ok" });
    expect(parseOdometer("42,000", null)).toBeNull();
    expect(parseOdometer("unknown", "km")).toBeNull();
    expect(evaluatePmPlan(plan, [], meters({ distance: null })).state).toBe("not_evaluated");
  });

  it("parses canonical odometer text with a unit and treats blank text as unknown", () => {
    expect(parseOdometer("42,000 km", "km")).toEqual({ value: 42000, unit: "km" });
    expect(parseOdometer("42,000km", null)).toEqual({ value: 42000, unit: "km" });
    expect(parseOdometer("26,100.5 miles", "mi")).toEqual({ value: 26100.5, unit: "mi" });
    expect(parseOdometer("42,000 mi", "km")).toBeNull();
    expect(parseOdometer("42,000 hrs", "km")).toBeNull();
    expect(parseOdometer("", "km")).toBeNull();
    expect(parseOdometer("   ", "km")).toBeNull();
  });

  it("never reports a plan as up to date while an interval cannot be evaluated", () => {
    const plan: PmPlan = { ...basePlan, intervalDistance: 5000, distanceUnit: "km", startDistance: 1000 };
    // Hours are fine, but the odometer is unknown, so the distance interval may already be due.
    const status = evaluatePmPlan(plan, [], meters({ distance: null }));
    expect(status.dimensions.map((entry) => entry.state)).toEqual(["ok", "not_evaluated"]);
    expect(status.state).toBe("not_evaluated");
    expect(worstPmState(["ok", "not_evaluated"])).toBe("not_evaluated");
    expect(worstPmState(["not_evaluated", "due"])).toBe("due");
    expect(worstPmState(["not_evaluated", "overdue"])).toBe("overdue");
  });

  it("counts an interval added after the last completion from the plan's starting point", () => {
    // Cycles were added to the plan after a completion that had no cycle reading.
    const plan: PmPlan = { ...basePlan, intervalCycles: 1000, startCycles: 4000 };
    const status = evaluatePmPlan(plan, [completion({ assetHours: 2390, cycles: null })], meters({ cycles: 4600 }));
    expect(status.dimensions.find((entry) => entry.dimension === "cycles")).toMatchObject({
      from: 4000,
      dueAt: 5000,
      remaining: 400,
      state: "ok",
    });
    expect(status.dimensions.find((entry) => entry.dimension === "hours")).toMatchObject({ from: 2390 });
  });

  it("combines plan and suggestion states without letting either hide an alert", () => {
    // No active plans: exactly the suggestion state.
    expect(combinePmStates(null, "due")).toBe("due");
    expect(combinePmStates(null, "not_evaluated")).toBe("not_evaluated");
    // Unevaluated suggestions are absence of evidence, not uncertainty.
    expect(combinePmStates("ok", "not_evaluated")).toBe("ok");
    expect(combinePmStates("ok", "overdue")).toBe("overdue");
    expect(combinePmStates("overdue", "ok")).toBe("overdue");
    // An unevaluable plan is uncertainty and still outranks "ok".
    expect(combinePmStates("not_evaluated", "ok")).toBe("not_evaluated");
    expect(combinePmStates("not_evaluated", "due")).toBe("due");
  });

  it("does not evaluate archived plans", () => {
    expect(evaluatePmPlan({ ...basePlan, active: false }, [], meters({ hours: 9999 })).state).toBe("not_evaluated");
  });

  it("summarizes intervals in plain language", () => {
    expect(pmIntervalSummary({ ...basePlan, intervalDays: 90 })).toBe("Every 250 h or 90 days, whichever comes first");
  });
});

describe("PM validation", () => {
  it("requires an interval and the starting meter for each meter interval", () => {
    expect(validatePmPlan({ name: "PM" }, NOW)).toMatchObject({ ok: false });
    expect(validatePmPlan({ name: "PM", intervalHours: 250 }, NOW)).toMatchObject({
      ok: false,
      error: "Enter the engine hours the hour interval counts from.",
    });
    expect(validatePmPlan({ name: "PM", intervalDistance: 5000, startDistance: 0 }, NOW)).toMatchObject({ ok: false });
    expect(validatePmPlan({ name: "PM", intervalHours: "250.5", startHours: 1 }, NOW).ok).toBe(false);
    expect(validatePmPlan({ name: "PM", intervalDays: 30, startDate: "2027-01-01" }, NOW).ok).toBe(false);
  });

  it("normalizes a valid plan and drops starting points for unused intervals", () => {
    const result = validatePmPlan(
      { name: " Grease ", intervalDays: "30", intervalDistance: "1,000", distanceUnit: "Miles", startDistance: "500", startHours: 99 },
      NOW,
    );
    expect(result.ok && result.value).toEqual({
      name: "Grease",
      instructions: null,
      intervalHours: null,
      intervalDistance: 1000,
      distanceUnit: "mi",
      intervalCycles: null,
      intervalDays: 30,
      startDate: "2026-10-13",
      startHours: null,
      startDistance: 500,
      startCycles: null,
      active: true,
    });
  });

  it("requires the meters the plan counts from at completion", () => {
    expect(validatePmCompletion({}, basePlan, NOW)).toMatchObject({ ok: false, error: "Enter the engine hours at completion." });
    expect(validatePmCompletion({ assetHours: 2500, completedOn: "2026-11-01" }, basePlan, NOW).ok).toBe(false);
    expect(validatePmCompletion({ assetHours: 2500, workOrderId: "nope" }, basePlan, NOW).ok).toBe(false);
    expect(validatePmCompletion({ assetHours: 2500, workOrderId: WO, notes: " ok " }, basePlan, NOW)).toMatchObject({
      ok: true,
      value: { completedOn: "2026-10-13", assetHours: 2500, workOrderId: WO, notes: "ok", distanceUnit: null },
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
      return rpcError ? { data: null, error: rpcError } : { data: { id: "new-id", version: 1 }, error: null };
    },
  };
}

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
  interval_days: 90,
  start_date: "2026-09-01",
  start_hours: 2300,
  start_distance: null,
  start_cycles: null,
  active: true,
  version: 3,
  created_by: USER,
  created_at: "2026-09-01T00:00:00Z",
  updated_by: USER,
  updated_at: "2026-09-01T00:00:00Z",
};

const completionRow = {
  id: "c1",
  shop_id: SHOP,
  sequence: 1,
  plan_id: PLAN,
  vehicle_id: ASSET,
  completed_on: "2026-10-01",
  asset_hours: 2390,
  distance: null,
  distance_unit: null,
  cycles: null,
  work_order_id: WO,
  notes: null,
  recorded_by: USER,
  created_at: "2026-10-01T12:00:00Z",
  voided_at: null,
  voided_by: null,
  void_reason: null,
};

const identity = { id: ASSET, engineHours: 2400, odometer: null, odometerUnit: null };

describe("PM service", () => {
  beforeEach(() => {
    mocks.authorize.mockReset();
  });

  it("loads plans with status, counting from the latest completion", async () => {
    mocks.authorize.mockResolvedValue(identity);
    const result = await loadAssetPm({
      supabase: fakeClient({
        work_orders: [{ id: WO, shop_id: SHOP, vehicle_id: ASSET, custom_id: "1042", status: "completed", record_type: "work_order", created_at: "2026-10-01T00:00:00Z" }],
      }) as never,
      admin: fakeClient({
        equipment_asset_profiles: [{ shop_id: SHOP, vehicle_id: ASSET, current_cycles: null, meters_updated_at: "2026-10-10T00:00:00Z" }],
        equipment_pm_plans: [planRow],
        equipment_pm_completions: [completionRow],
      }) as never,
      shopId: SHOP,
      role: "mechanic",
      assetId: ASSET,
      now: NOW,
    });
    expect(result?.meters).toMatchObject({ hours: 2400, today: "2026-10-13", updatedAt: "2026-10-10T00:00:00Z" });
    const plan = result!.plans[0];
    expect(plan.lastCompletion?.workOrder).toEqual({ id: WO, label: "WO-1042", href: `/work-orders/${WO}` });
    expect(plan.dimensions.map((entry) => [entry.dimension, entry.remaining])).toEqual([
      ["hours", 240],
      ["days", 78],
    ]);
    expect(result?.state).toBe("ok");
    expect(result?.workOrders).toEqual([{ id: WO, label: "WO-1042", status: "completed", createdAt: "2026-10-01T00:00:00Z" }]);
  });

  it("returns the full completion history, not just the latest page", async () => {
    mocks.authorize.mockResolvedValue(identity);
    const many = Array.from({ length: 12 }, (_, index) => ({
      ...completionRow,
      id: `c${index}`,
      sequence: index,
      work_order_id: null,
      completed_on: `2026-09-${String(index + 1).padStart(2, "0")}`,
    }));
    const result = await loadAssetPm({
      supabase: fakeClient({}) as never,
      admin: fakeClient({ equipment_pm_plans: [planRow], equipment_pm_completions: many }) as never,
      shopId: SHOP,
      role: "manager",
      assetId: ASSET,
      now: NOW,
    });
    expect(result!.plans[0].history).toHaveLength(12);
  });

  it("uses the newest work-order odometer as the current distance, like the directory", async () => {
    mocks.authorize.mockResolvedValue({ ...identity, odometer: "500", odometerUnit: "mi" });
    const result = await loadAssetPm({
      supabase: fakeClient({
        work_orders: [
          { id: "wo-old", shop_id: SHOP, vehicle_id: ASSET, record_type: "work_order", status: "completed", created_at: "2026-09-01T00:00:00Z", odometer_km: 700 },
          { id: "wo-new", shop_id: SHOP, vehicle_id: ASSET, record_type: "work_order", status: "completed", created_at: "2026-10-01T00:00:00Z", odometer_km: 812 },
        ],
      }) as never,
      admin: fakeClient({}) as never,
      shopId: SHOP,
      role: "manager",
      assetId: ASSET,
      now: NOW,
    });
    expect(result?.meters.distance).toEqual({ value: 812, unit: "km" });
  });

  it("hides the linked work order of a completion the caller cannot see", async () => {
    mocks.authorize.mockResolvedValue(identity);
    const result = await loadAssetPm({
      supabase: fakeClient({}) as never,
      admin: fakeClient({ equipment_pm_plans: [planRow], equipment_pm_completions: [completionRow] }) as never,
      shopId: SHOP,
      role: "mechanic",
      assetId: ASSET,
      now: NOW,
    });
    expect(result!.plans[0].lastCompletion?.workOrder).toEqual({ id: WO, label: "Work order", href: null });
  });

  it("returns null for an asset the caller cannot see", async () => {
    mocks.authorize.mockResolvedValue(null);
    const result = await loadAssetPm({
      supabase: fakeClient({}) as never,
      admin: fakeClient({}) as never,
      shopId: SHOP,
      role: "mechanic",
      assetId: ASSET,
    });
    expect(result).toBeNull();
  });

  it("lets managers create and update plans with the loaded version", async () => {
    mocks.authorize.mockResolvedValue(identity);
    const rpcs: Array<{ name: string; args: Record<string, unknown> }> = [];
    const context = {
      supabase: fakeClient({}) as never,
      admin: fakeClient({ equipment_pm_plans: [planRow] }, rpcs) as never,
      shopId: SHOP,
      role: "manager" as const,
      actorUserId: USER,
      now: NOW,
    };
    await savePmPlan({ ...context, assetId: ASSET, planId: null, body: { name: "PM", intervalDays: 30, operationKey: KEY } });
    expect(rpcs[0]).toMatchObject({
      name: "equipment_pm_plan_save",
      args: { p_vehicle_id: ASSET, p_plan_id: null, p_expected_version: null, p_operation_key: KEY, p_plan: { name: "PM", interval_days: 30, start_date: "2026-10-13" } },
    });
    await expect(
      savePmPlan({ ...context, assetId: null, planId: PLAN, body: { name: "PM", intervalDays: 30, operationKey: KEY } }),
    ).rejects.toMatchObject({ status: 400 });
    await savePmPlan({ ...context, assetId: null, planId: PLAN, body: { name: "PM", intervalDays: 30, expectedVersion: 3, operationKey: KEY } });
    expect(rpcs[1].args).toMatchObject({ p_vehicle_id: ASSET, p_plan_id: PLAN, p_expected_version: 3 });
  });

  it("refuses plan changes from non-managers and maps stale versions to 409", async () => {
    mocks.authorize.mockResolvedValue(identity);
    const body = { name: "PM", intervalDays: 30, expectedVersion: 1, operationKey: KEY };
    await expect(
      savePmPlan({ supabase: {} as never, admin: fakeClient({}) as never, shopId: SHOP, role: "mechanic", actorUserId: USER, assetId: ASSET, planId: null, body }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      savePmPlan({
        supabase: {} as never,
        admin: fakeClient({ equipment_pm_plans: [planRow] }, [], { code: "40001", message: "changed" }) as never,
        shopId: SHOP,
        role: "manager",
        actorUserId: USER,
        assetId: null,
        planId: PLAN,
        body,
      }),
    ).rejects.toMatchObject({ status: 409 });
    mocks.authorize.mockResolvedValue(null);
    await expect(
      savePmPlan({ supabase: {} as never, admin: fakeClient({ equipment_pm_plans: [planRow] }) as never, shopId: SHOP, role: "manager", actorUserId: USER, assetId: null, planId: PLAN, body }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("lets an assigned mechanic record a completion linked to a visible work order", async () => {
    mocks.authorize.mockResolvedValue(identity);
    const rpcs: Array<{ name: string; args: Record<string, unknown> }> = [];
    const context = {
      admin: fakeClient({ equipment_pm_plans: [planRow] }, rpcs) as never,
      shopId: SHOP,
      role: "mechanic" as const,
      actorUserId: USER,
      planId: PLAN,
      now: NOW,
    };
    await recordPmCompletion({
      ...context,
      supabase: fakeClient({ work_orders: [{ id: WO, shop_id: SHOP, vehicle_id: ASSET }] }) as never,
      body: { assetHours: 2510, workOrderId: WO, operationKey: KEY },
    });
    expect(rpcs[0]).toMatchObject({
      name: "equipment_pm_complete",
      args: { p_plan_id: PLAN, p_operation_key: KEY, p_completion: { completed_on: "2026-10-13", asset_hours: 2510, work_order_id: WO } },
    });
    await expect(
      recordPmCompletion({ ...context, supabase: fakeClient({}) as never, body: { assetHours: 2510, workOrderId: WO, operationKey: KEY } }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      recordPmCompletion({ ...context, supabase: fakeClient({}) as never, body: { operationKey: KEY } }),
    ).rejects.toMatchObject({ status: 400 });
    // A visible estimate for the same asset is not a work order and cannot be linked.
    await expect(
      recordPmCompletion({
        ...context,
        supabase: fakeClient({ work_orders: [{ id: WO, shop_id: SHOP, vehicle_id: ASSET, record_type: "estimate" }] }) as never,
        body: { assetHours: 2510, workOrderId: WO, operationKey: KEY },
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(rpcs).toHaveLength(1);
    mocks.authorize.mockResolvedValue(null);
    await expect(
      recordPmCompletion({ ...context, supabase: fakeClient({}) as never, body: { assetHours: 2510, operationKey: KEY } }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("refuses completions from read-only roles and voids from non-managers", async () => {
    mocks.authorize.mockResolvedValue(identity);
    await expect(
      recordPmCompletion({ supabase: {} as never, admin: fakeClient({}) as never, shopId: SHOP, role: "parts", actorUserId: USER, planId: PLAN, body: { operationKey: KEY } }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      voidPmCompletion({ supabase: {} as never, admin: fakeClient({}) as never, shopId: SHOP, role: "mechanic", actorUserId: USER, completionId: "c1", body: { reason: "x", operationKey: KEY } }),
    ).rejects.toMatchObject({ status: 403 });
    const rpcs: Array<{ name: string; args: Record<string, unknown> }> = [];
    await voidPmCompletion({
      supabase: {} as never,
      admin: fakeClient({ equipment_pm_completions: [completionRow] }, rpcs) as never,
      shopId: SHOP,
      role: "manager",
      actorUserId: USER,
      completionId: "c1",
      body: { reason: " Wrong machine ", operationKey: KEY },
    });
    expect(rpcs[0]).toMatchObject({ name: "equipment_pm_completion_void", args: { p_completion_id: "c1", p_reason: "Wrong machine" } });
  });
});
