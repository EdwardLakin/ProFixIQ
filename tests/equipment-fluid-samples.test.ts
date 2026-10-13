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
  analyteTrends,
  buildFluidHistory,
  latestFluidSampleSummaries,
  normalizeAnalyte,
  validateFluidSample,
  type FluidSample,
} from "@/features/equipment/lib/fluids";
import {
  loadAssetFluidSamples,
  loadFluidSampleSummaries,
  recordFluidSample,
  voidFluidSample,
} from "@/features/equipment/server/equipmentFluidSampleService";

const SHOP = "00000000-0000-4000-8000-000000000111";
const USER = "00000000-0000-4000-8000-000000000222";
const ASSET = "00000000-0000-4000-8000-000000000333";
const ENGINE = "00000000-0000-4000-8000-000000000444";
const KEY = "00000000-0000-4000-8000-000000000999";
const NOW = Date.parse("2026-10-13T15:00:00Z");

function sample(overrides: Partial<FluidSample> = {}): FluidSample {
  return {
    id: "s1",
    sequence: 1,
    componentId: ENGINE,
    componentName: "Engine",
    fluidType: "engine_oil",
    sampledAt: "2026-10-01T12:00:00.000Z",
    assetHours: 6200,
    fluidHours: 250,
    fluidDistance: null,
    fluidDistanceUnit: null,
    labName: "Lab Co",
    labReportNumber: "R-1",
    labStatus: "normal",
    notes: null,
    recordedBy: USER,
    createdAt: "2026-10-01T12:00:00.000Z",
    voided: null,
    results: [],
    ...overrides,
  };
}

describe("fluid sample validation", () => {
  it("normalizes analyte names to stored keys", () => {
    expect(normalizeAnalyte(" Viscosity 100C ")).toBe("viscosity_100c");
    expect(normalizeAnalyte("Iron")).toBe("iron");
    expect(normalizeAnalyte("4406")).toBeNull();
    expect(normalizeAnalyte("")).toBeNull();
  });

  it("accepts a lab report with results and keeps the lab's own status and flags", () => {
    const result = validateFluidSample(
      {
        fluidType: "engine_oil",
        componentId: ENGINE,
        sampledAt: "2026-10-01",
        assetHours: "6200",
        fluidHours: "250.5",
        labName: " Lab Co ",
        labReportNumber: " R-1 ",
        labStatus: "caution",
        results: [
          { analyte: "Iron", value: "42", unit: "ppm", labFlag: "caution" },
          { analyte: "silicon", value: 9, unit: "ppm" },
        ],
      },
      NOW,
    );
    expect(result).toEqual({
      ok: true,
      value: {
        componentId: ENGINE,
        fluidType: "engine_oil",
        sampledAt: "2026-10-01T12:00:00.000Z",
        assetHours: 6200,
        fluidHours: 250.5,
        fluidDistance: null,
        fluidDistanceUnit: null,
        labName: "Lab Co",
        labReportNumber: "R-1",
        labStatus: "caution",
        notes: null,
        results: [
          { analyte: "iron", value: 42, unit: "ppm", labFlag: "caution" },
          { analyte: "silicon", value: 9, unit: "ppm", labFlag: null },
        ],
      },
    });
  });

  it("defaults the lab status to not reported and refuses bad input", () => {
    expect(validateFluidSample({ fluidType: "coolant" }, NOW)).toMatchObject({ ok: true, value: { labStatus: "unknown", results: [] } });
    expect(validateFluidSample({ fluidType: "milk" }, NOW).ok).toBe(false);
    expect(validateFluidSample({ fluidType: "coolant", labStatus: "good" }, NOW).ok).toBe(false);
    expect(validateFluidSample({ fluidType: "coolant", sampledAt: "2026-10-14" }, NOW)).toMatchObject({
      ok: false,
      error: "A sample cannot be dated in the future.",
    });
    expect(validateFluidSample({ fluidType: "coolant", fluidDistance: 500 }, NOW).ok).toBe(false);
    expect(validateFluidSample({ fluidType: "coolant", componentId: "nope" }, NOW).ok).toBe(false);
    expect(validateFluidSample({ fluidType: "coolant", assetHours: 1.5 }, NOW).ok).toBe(false);
    expect(validateFluidSample({ fluidType: "coolant", fluidHours: "   " }, NOW)).toMatchObject({
      ok: true,
      value: { fluidHours: null },
    });
    expect(
      validateFluidSample({ fluidType: "coolant", results: [{ analyte: "iron", value: 1 }, { analyte: "Iron", value: 2 }] }, NOW),
    ).toMatchObject({ ok: false, error: "Iron (Fe) is entered more than once." });
    expect(validateFluidSample({ fluidType: "coolant", results: [{ analyte: "iron", value: "   " }] }, NOW).ok).toBe(false);
    expect(validateFluidSample({ fluidType: "coolant", results: [{ analyte: "iron", value: 1, labFlag: "bad" }] }, NOW).ok).toBe(false);
    expect(
      validateFluidSample({ fluidType: "coolant", results: Array.from({ length: 101 }, (_, i) => ({ analyte: `a${i}`, value: 1 })) }, NOW).ok,
    ).toBe(false);
  });
});

describe("fluid sample trends", () => {
  const older = sample({
    id: "old",
    sequence: 1,
    sampledAt: "2026-09-01T12:00:00.000Z",
    fluidHours: 100,
    results: [
      { analyte: "iron", value: 20, unit: "ppm", labFlag: null },
      { analyte: "viscosity_100c", value: 14.5, unit: "cSt", labFlag: "normal" },
    ],
  });
  const newer = sample({
    id: "new",
    sequence: 2,
    sampledAt: "2026-10-01T12:00:00.000Z",
    fluidHours: 300,
    labStatus: "caution",
    results: [
      { analyte: "iron", value: 42, unit: "ppm", labFlag: "caution" },
      { analyte: "viscosity_100c", value: 14.2, unit: "mm2/s", labFlag: "normal" },
      { analyte: "silicon", value: 9, unit: "ppm", labFlag: null },
    ],
  });

  it("reports latest, previous and plain change per analyte without inventing fill continuity", () => {
    const trends = analyteTrends([newer, older]);
    const iron = trends.find((trend) => trend.analyte === "iron")!;
    expect(iron).toMatchObject({
      label: "Iron (Fe)",
      latest: { value: 42, labFlag: "caution", sampleId: "new" },
      previous: { value: 20, sampleId: "old" },
      change: 22,
      fluidHoursBetween: null,
      changePer100FluidHours: null,
    });
    expect(trends.find((trend) => trend.analyte === "viscosity_100c")).toMatchObject({ change: null, changePer100FluidHours: null });
    expect(trends.find((trend) => trend.analyte === "silicon")).toMatchObject({ previous: null, change: null });
  });

  it("gives no rate across a fluid change or without fluid hours", () => {
    const refilled = { ...newer, fluidHours: 50 };
    expect(analyteTrends([refilled, older])[0]).toMatchObject({ change: 22, fluidHoursBetween: null, changePer100FluidHours: null });
    const unknownHours = { ...newer, fluidHours: null };
    expect(analyteTrends([unknownHours, older])[0]).toMatchObject({ change: 22, changePer100FluidHours: null });
  });

  it("groups by component and fluid, newest first, ignoring voided samples in trends", () => {
    const voided = sample({
      id: "voided",
      sequence: 3,
      sampledAt: "2026-10-05T12:00:00.000Z",
      voided: { at: "2026-10-06T00:00:00Z", reason: "Wrong machine" },
      results: [{ analyte: "iron", value: 999, unit: "ppm", labFlag: "critical" }],
    });
    const hydraulic = sample({ id: "hyd", componentId: null, componentName: null, fluidType: "hydraulic" });
    const groups = buildFluidHistory([older, voided, hydraulic, newer]);
    expect(groups.map((group) => group.label)).toEqual(["Engine oil · Engine", "Hydraulic"]);
    const engine = groups[0];
    expect(engine.samples.map((entry) => entry.id)).toEqual(["new", "old"]);
    expect(engine.voided.map((entry) => entry.id)).toEqual(["voided"]);
    expect(engine.latest?.id).toBe("new");
    expect(engine.trends[0]).toMatchObject({ analyte: "iron", latest: { value: 42 } });
  });

  it("summarizes the latest live sample per component and fluid with the lab's status", () => {
    const voided = sample({ id: "voided", sequence: 3, sampledAt: "2026-10-05T12:00:00.000Z", labStatus: "critical", voided: { at: "x", reason: "y" } });
    expect(latestFluidSampleSummaries([older, newer, voided])).toEqual([
      {
        key: `${ENGINE}:engine_oil`,
        label: "Engine oil · Engine",
        fluidType: "engine_oil",
        componentName: "Engine",
        sampleId: "new",
        sampledAt: "2026-10-01T12:00:00.000Z",
        labStatus: "caution",
        labReportNumber: "R-1",
        labName: "Lab Co",
      },
    ]);
  });
});

type Tables = Record<string, Array<Record<string, unknown>>>;
type RpcCall = { name: string; args: Record<string, unknown> };

function fakeClient(tables: Tables, rpcs: RpcCall[] = [], rpcError: unknown = null) {
  return {
    from(table: string) {
      const filters: Array<(row: Record<string, unknown>) => boolean> = [];
      const rows = () => (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
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
        order: () => builder,
        limit: () => builder,
        range: () => builder,
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (resolve: (value: unknown) => void) => resolve({ data: rows(), error: null }),
      };
      return builder;
    },
    async rpc(name: string, args: Record<string, unknown>) {
      rpcs.push({ name, args });
      return rpcError ? { data: null, error: rpcError } : { data: { id: "new-id" }, error: null };
    },
  };
}

const sampleRow = {
  id: "s1",
  shop_id: SHOP,
  sequence: 1,
  vehicle_id: ASSET,
  component_id: ENGINE,
  fluid_type: "engine_oil",
  sampled_at: "2026-10-01T12:00:00+00:00",
  asset_hours: 6200,
  fluid_hours: "250.0",
  fluid_distance: null,
  fluid_distance_unit: null,
  lab_name: "Lab Co",
  lab_report_number: "R-1",
  lab_status: "caution",
  notes: null,
  recorded_by: USER,
  created_at: "2026-10-01T12:00:00+00:00",
  voided_at: null,
  voided_by: null,
  void_reason: null,
};

const resultRows = [
  { id: "r2", shop_id: SHOP, sample_id: "s1", position: 1, analyte: "silicon", value: "9", unit: "ppm", lab_flag: null },
  { id: "r1", shop_id: SHOP, sample_id: "s1", position: 0, analyte: "iron", value: "42", unit: "ppm", lab_flag: "caution" },
  { id: "r3", shop_id: "other", sample_id: "s1", position: 2, analyte: "copper", value: "1", unit: "ppm", lab_flag: null },
];

const identity = { id: ASSET, engineHours: 6300 };

describe("fluid sample service", () => {
  beforeEach(() => {
    mocks.authorize.mockReset();
  });

  it("loads grouped history with results in lab order and current or historical components", async () => {
    mocks.authorize.mockResolvedValue(identity);
    const result = await loadAssetFluidSamples({
      supabase: fakeClient({}) as never,
      admin: fakeClient({
        equipment_fluid_samples: [sampleRow, { ...sampleRow, id: "other-shop", shop_id: "other" }],
        equipment_fluid_sample_results: resultRows,
        equipment_components: [{ id: ENGINE, shop_id: SHOP, label: "Engine", installed_vehicle_id: ASSET }],
        equipment_component_events: [{ shop_id: SHOP, component_id: ENGINE, vehicle_id: ASSET, event_type: "installed", sequence: 1 }],
      }) as never,
      shopId: SHOP,
      role: "mechanic",
      assetId: ASSET,
    });
    expect(result?.components).toEqual([{ id: ENGINE, label: "Engine" }]);
    expect(result?.groups).toHaveLength(1);
    const group = result!.groups[0];
    expect(group.label).toBe("Engine oil · Engine");
    expect(group.samples.map((entry) => entry.id)).toEqual(["s1"]);
    expect(group.latest).toMatchObject({ fluidHours: 250, labStatus: "caution" });
    expect(group.latest?.results).toEqual([
      { analyte: "iron", value: 42, unit: "ppm", labFlag: "caution" },
      { analyte: "silicon", value: 9, unit: "ppm", labFlag: null },
    ]);
  });

  it("returns null for an asset the caller cannot see", async () => {
    mocks.authorize.mockResolvedValue(null);
    const result = await loadAssetFluidSamples({
      supabase: fakeClient({}) as never,
      admin: fakeClient({ equipment_fluid_samples: [sampleRow] }) as never,
      shopId: SHOP,
      role: "mechanic",
      assetId: ASSET,
    });
    expect(result).toBeNull();
  });

  it("summarizes only live samples for Asset Health", async () => {
    const summaries = await loadFluidSampleSummaries({
      admin: fakeClient({
        equipment_fluid_samples: [
          sampleRow,
          { ...sampleRow, id: "s2", sequence: 2, sampled_at: "2026-10-05T12:00:00+00:00", lab_status: "critical", voided_at: "2026-10-06T00:00:00Z", void_reason: "Wrong" },
        ],
        equipment_components: [{ id: ENGINE, shop_id: SHOP, label: "Engine" }],
      }) as never,
      shopId: SHOP,
      assetId: ASSET,
    });
    expect(summaries).toEqual([expect.objectContaining({ sampleId: "s1", labStatus: "caution", label: "Engine oil · Engine" })]);
  });

  it("lets an assigned mechanic record a sample atomically through the RPC without injecting mutable meter data", async () => {
    mocks.authorize.mockResolvedValue(identity);
    const rpcs: RpcCall[] = [];
    const result = await recordFluidSample({
      supabase: fakeClient({}) as never,
      admin: fakeClient({}, rpcs) as never,
      shopId: SHOP,
      role: "mechanic",
      actorUserId: USER,
      assetId: ASSET,
      now: NOW,
      body: {
        fluidType: "engine_oil",
        componentId: ENGINE,
        labStatus: "caution",
        labReportNumber: "R-1",
        results: [{ analyte: "Iron", value: "42", unit: "ppm", labFlag: "caution" }],
        operationKey: KEY,
      },
    });
    expect(result).toEqual({ id: "new-id" });
    expect(rpcs).toEqual([
      {
        name: "equipment_fluid_sample_record",
        args: {
          p_shop_id: SHOP,
          p_actor_user_id: USER,
          p_vehicle_id: ASSET,
          p_sample: {
            component_id: ENGINE,
            fluid_type: "engine_oil",
            sampled_at: null,
            asset_hours: null,
            fluid_hours: null,
            fluid_distance: null,
            fluid_distance_unit: null,
            lab_name: null,
            lab_report_number: "R-1",
            lab_status: "caution",
            notes: null,
          },
          p_results: [{ analyte: "iron", value: 42, unit: "ppm", lab_flag: "caution" }],
          p_operation_key: KEY,
        },
      },
    ]);
  });

  it("does not stamp today's meter on a backdated sample", async () => {
    mocks.authorize.mockResolvedValue(identity);
    const rpcs: RpcCall[] = [];
    await recordFluidSample({
      supabase: fakeClient({}) as never,
      admin: fakeClient({}, rpcs) as never,
      shopId: SHOP,
      role: "manager",
      actorUserId: USER,
      assetId: ASSET,
      now: NOW,
      body: { fluidType: "hydraulic", sampledAt: "2026-09-01", operationKey: KEY },
    });
    expect(rpcs[0].args.p_sample).toMatchObject({ sampled_at: "2026-09-01T12:00:00.000Z", asset_hours: null });
  });

  it("refuses read-only roles, missing keys, invalid bodies and hidden assets before the RPC", async () => {
    const rpcs: RpcCall[] = [];
    const base = {
      supabase: fakeClient({}) as never,
      admin: fakeClient({}, rpcs) as never,
      shopId: SHOP,
      actorUserId: USER,
      assetId: ASSET,
      now: NOW,
    };
    mocks.authorize.mockResolvedValue(identity);
    await expect(recordFluidSample({ ...base, role: "parts", body: { fluidType: "coolant", operationKey: KEY } })).rejects.toMatchObject({ status: 403 });
    await expect(recordFluidSample({ ...base, role: "mechanic", body: { fluidType: "coolant" } })).rejects.toMatchObject({ status: 400 });
    await expect(recordFluidSample({ ...base, role: "mechanic", body: { fluidType: "x", operationKey: KEY } })).rejects.toMatchObject({ status: 400 });
    mocks.authorize.mockResolvedValue(null);
    await expect(recordFluidSample({ ...base, role: "mechanic", body: { fluidType: "coolant", operationKey: KEY } })).rejects.toMatchObject({ status: 404 });
    expect(rpcs).toHaveLength(0);
  });

  it("maps duplicate lab reports, foreign components and key reuse to clear errors", async () => {
    mocks.authorize.mockResolvedValue(identity);
    const run = (error: unknown) =>
      recordFluidSample({
        supabase: fakeClient({}) as never,
        admin: fakeClient({}, [], error) as never,
        shopId: SHOP,
        role: "manager",
        actorUserId: USER,
        assetId: ASSET,
        now: NOW,
        body: { fluidType: "engine_oil", componentId: ENGINE, labReportNumber: "R-1", operationKey: KEY },
      });
    await expect(
      run({ code: "23505", message: 'duplicate key value violates unique constraint "equipment_fluid_samples_lab_report_key"' }),
    ).rejects.toMatchObject({ status: 409, message: "This lab report number is already recorded for this asset." });
    await expect(
      run({ code: "23514", message: "Fluid sample component must be installed on the asset" }),
    ).rejects.toMatchObject({ status: 400, message: "That component is not installed on this asset." });
    await expect(
      run({ code: "22023", message: "Operation key was already used for a different request" }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(run({ code: "P0002", message: "Asset not found" })).rejects.toMatchObject({ status: 404 });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(run({ code: "XX000", message: "boom" })).rejects.toMatchObject({ status: 500 });
  });

  it("lets only managers void, once per shop-scoped sample", async () => {
    mocks.authorize.mockResolvedValue(identity);
    const rpcs: RpcCall[] = [];
    const admin = fakeClient({ equipment_fluid_samples: [sampleRow] }, rpcs) as never;
    await expect(
      voidFluidSample({ supabase: {} as never, admin, shopId: SHOP, role: "mechanic", actorUserId: USER, sampleId: "s1", body: { reason: "x", operationKey: KEY } }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      voidFluidSample({ supabase: {} as never, admin, shopId: "other", role: "manager", actorUserId: USER, sampleId: "s1", body: { reason: "x", operationKey: KEY } }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      voidFluidSample({ supabase: {} as never, admin, shopId: SHOP, role: "manager", actorUserId: USER, sampleId: "s1", body: { reason: " ", operationKey: KEY } }),
    ).rejects.toMatchObject({ status: 400 });
    await voidFluidSample({
      supabase: {} as never,
      admin,
      shopId: SHOP,
      role: "manager",
      actorUserId: USER,
      sampleId: "s1",
      body: { reason: " Wrong machine ", operationKey: KEY },
    });
    expect(rpcs).toEqual([
      {
        name: "equipment_fluid_sample_void",
        args: { p_shop_id: SHOP, p_actor_user_id: USER, p_sample_id: "s1", p_reason: "Wrong machine", p_operation_key: KEY },
      },
    ]);
    await expect(
      voidFluidSample({
        supabase: {} as never,
        admin: fakeClient({ equipment_fluid_samples: [sampleRow] }, [], { code: "22023", message: "This sample is already voided" }) as never,
        shopId: SHOP,
        role: "manager",
        actorUserId: USER,
        sampleId: "s1",
        body: { reason: "Again", operationKey: KEY },
      }),
    ).rejects.toMatchObject({ status: 409, message: "This sample is already voided." });
  });
});