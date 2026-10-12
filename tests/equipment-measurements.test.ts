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
  buildMeasurementSeries,
  toCanonical,
  validateMeasurementBatch,
  validateMeasurementCorrection,
  type EquipmentMeasurement,
} from "@/features/equipment/lib/measurements";
import {
  correctMeasurement,
  recordMeasurements,
} from "@/features/equipment/server/equipmentMeasurementService";

const SHOP = "00000000-0000-4000-8000-000000000111";
const USER = "00000000-0000-4000-8000-000000000222";
const OTHER_USER = "00000000-0000-4000-8000-000000000333";
const ASSET = "00000000-0000-4000-8000-000000000001";
const OTHER_ASSET = "00000000-0000-4000-8000-000000000002";
const MEASUREMENT = "00000000-0000-4000-8000-000000000444";
const KEY = "00000000-0000-4000-8000-0000000000aa";

describe("unit conversion", () => {
  it("converts entered units to the canonical unit", () => {
    expect(toCanonical("track_shoe_height", 1, "in")).toEqual({ value: 25.4, unit: "mm" });
    expect(toCanonical("tire_pressure", 100, "psi")).toEqual({ value: 689.4757, unit: "kPa" });
    expect(toCanonical("tire_pressure", 2, "bar")).toEqual({ value: 200, unit: "kPa" });
    expect(toCanonical("coolant_temperature", 212, "F")).toEqual({ value: 100, unit: "C" });
    expect(toCanonical("crankcase_blow_by", 1, "cfm")).toEqual({ value: 28.3168, unit: "L/min" });
  });

  it("rejects a unit from another dimension", () => {
    expect(toCanonical("track_shoe_height", 10, "psi")).toBeNull();
  });
});

describe("measurement validation", () => {
  const reading = { measurementType: "track_shoe_height", position: "left", value: "42.5", unit: "mm" };

  it("normalizes a batch and keeps what was entered", () => {
    const result = validateMeasurementBatch({
      readings: [reading, { measurementType: "tire_pressure", value: 90, unit: "psi" }],
      measuredAt: "2026-10-01",
      operationKey: KEY,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.entries[0]).toMatchObject({ value: 42.5, unit: "mm", enteredValue: 42.5, enteredUnit: "mm", position: "left" });
    expect(result.value.entries[1]).toMatchObject({ unit: "kPa", enteredValue: 90, enteredUnit: "psi" });
    expect(result.value.measuredAt).toBe("2026-10-01T12:00:00.000Z");
  });

  it("rejects unknown types, non-numbers, implausible values and missing keys", () => {
    expect(validateMeasurementBatch({ readings: [{ ...reading, measurementType: "vibes" }], operationKey: KEY }).ok).toBe(false);
    expect(validateMeasurementBatch({ readings: [{ ...reading, value: "abc" }], operationKey: KEY }).ok).toBe(false);
    expect(validateMeasurementBatch({ readings: [{ ...reading, value: "-4" }], operationKey: KEY }).ok).toBe(false);
    expect(validateMeasurementBatch({ readings: [reading] }).ok).toBe(false);
    expect(validateMeasurementBatch({ readings: [], operationKey: KEY }).ok).toBe(false);
  });

  it("only accepts a meter reading together with a backdated date", () => {
    expect(validateMeasurementBatch({ readings: [reading], assetHours: 1200, operationKey: KEY }).ok).toBe(false);
    const ok = validateMeasurementBatch({
      readings: [reading],
      measuredAt: "2026-09-01",
      assetHours: "1200",
      operationKey: KEY,
    });
    expect(ok.ok && ok.value.assetHours).toBe(1200);
    expect(
      validateMeasurementBatch({ readings: [reading], measuredAt: "2026-09-01", assetHours: 12.5, operationKey: KEY }).ok,
    ).toBe(false);
  });

  it("requires a reason for corrections", () => {
    expect(validateMeasurementCorrection({ void: true, operationKey: KEY }).ok).toBe(false);
    expect(validateMeasurementCorrection({ void: true, reason: "Wrong machine", operationKey: KEY }).ok).toBe(true);
    expect(validateMeasurementCorrection({ value: 40, unit: "mm", reason: "Typo", operationKey: KEY }).ok).toBe(true);
  });
});

function row(patch: Partial<EquipmentMeasurement>): EquipmentMeasurement {
  return {
    id: "m",
    sequence: 1,
    vehicleId: ASSET,
    asset: null,
    measurementType: "track_shoe_height",
    position: "left",
    componentId: null,
    componentName: null,
    value: 50,
    unit: "mm",
    enteredValue: 50,
    enteredUnit: "mm",
    assetHours: 1000,
    measuredAt: "2026-09-01T12:00:00.000Z",
    workOrderId: null,
    inspectionId: null,
    notes: null,
    correctsMeasurementId: null,
    voided: false,
    correctionReason: null,
    recordedBy: USER,
    ...patch,
  };
}

describe("measurement series", () => {
  it("reports the factual change and rate between the latest two readings", () => {
    const [series] = buildMeasurementSeries([
      row({ id: "a", sequence: 1, value: 50, assetHours: 1000, measuredAt: "2026-09-01T12:00:00.000Z" }),
      row({ id: "b", sequence: 2, value: 46, assetHours: 1400, measuredAt: "2026-10-01T12:00:00.000Z" }),
    ]);
    expect(series.latest.id).toBe("b");
    expect(series.change).toBe(-4);
    expect(series.hoursBetween).toBe(400);
    expect(series.changePer100Hours).toBe(-1);
  });

  it("uses corrections in place of the original and drops voided readings", () => {
    const [series] = buildMeasurementSeries([
      row({ id: "a", sequence: 1, value: 50 }),
      row({ id: "b", sequence: 2, value: 460, measuredAt: "2026-10-01T12:00:00.000Z" }),
      row({ id: "c", sequence: 3, value: 46, measuredAt: "2026-10-01T12:00:00.000Z", correctsMeasurementId: "b", correctionReason: "Decimal slip" }),
      row({ id: "d", sequence: 4, value: 10, measuredAt: "2026-10-02T12:00:00.000Z" }),
      row({ id: "e", sequence: 5, value: 10, measuredAt: "2026-10-02T12:00:00.000Z", correctsMeasurementId: "d", voided: true, correctionReason: "Wrong machine" }),
    ]);
    expect(series.points.map((point) => point.id)).toEqual(["c", "a"]);
    expect(series.latest).toMatchObject({ value: 46, corrected: true, originalId: "b" });
    expect(series.change).toBe(-4);
  });

  it("keeps source links and the asset on every point", () => {
    const asset = { id: ASSET, label: "Unit DZ-1", href: `/equipment/${ASSET}` };
    const [series] = buildMeasurementSeries([
      row({ id: "a", workOrderId: "wo", inspectionId: "insp", asset }),
    ]);
    expect(series.latest).toMatchObject({ workOrderId: "wo", inspectionId: "insp", asset });
  });

  it("separates series by position and component", () => {
    const series = buildMeasurementSeries([
      row({ id: "a", position: "left" }),
      row({ id: "b", position: "right" }),
      row({ id: "c", position: "left", componentId: "comp", componentName: "Undercarriage — Left" }),
    ]);
    expect(series).toHaveLength(3);
  });
});

type Rpc = { name: string; args: Record<string, unknown> };

function fakeClient(rows: Record<string, Record<string, unknown> | null>, rpcs: Rpc[] = [], rpcResult: unknown = null) {
  return {
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
      };
      return builder;
    },
    async rpc(name: string, args: Record<string, unknown>) {
      rpcs.push({ name, args });
      return { data: rpcResult, error: null };
    },
  };
}

function context(role: string, supabase: unknown, admin: unknown) {
  return {
    supabase: supabase as never,
    admin: admin as never,
    shopId: SHOP,
    role: role as never,
    actorUserId: USER,
  };
}

const batch = {
  entries: [
    {
      measurementType: "track_shoe_height" as const,
      position: "left" as const,
      componentId: null,
      value: 42.5,
      unit: "mm",
      enteredValue: 42.5,
      enteredUnit: "mm",
      notes: null,
    },
  ],
  measuredAt: null,
  assetHours: null,
  workOrderId: null,
  inspectionId: null,
  operationKey: KEY,
};

describe("recording measurements", () => {
  beforeEach(() => {
    mocks.authorize.mockReset();
    mocks.authorize.mockResolvedValue({ id: ASSET, engineHours: 1400 });
  });

  it("lets an assigned mechanic record on a visible asset with the asset meter", async () => {
    const rpcs: Rpc[] = [];
    await recordMeasurements({
      ...context("mechanic", fakeClient({}), fakeClient({}, rpcs, [MEASUREMENT])),
      assetId: ASSET,
      batch,
    });
    expect(mocks.authorize).toHaveBeenCalledWith(expect.objectContaining({ role: "mechanic", assetId: ASSET }));
    expect(rpcs[0]).toMatchObject({
      name: "equipment_measurement_record",
      args: { p_vehicle_id: ASSET, p_asset_hours: 1400, p_operation_key: KEY },
    });
  });

  it("never stamps a backdated reading with today's meter", async () => {
    const rpcs: Rpc[] = [];
    await recordMeasurements({
      ...context("manager", fakeClient({}), fakeClient({}, rpcs, [MEASUREMENT])),
      assetId: ASSET,
      batch: { ...batch, measuredAt: "2026-09-01T12:00:00.000Z" },
    });
    expect(rpcs[0].args.p_asset_hours).toBeUndefined();
    await recordMeasurements({
      ...context("manager", fakeClient({}), fakeClient({}, rpcs, [MEASUREMENT])),
      assetId: ASSET,
      batch: { ...batch, measuredAt: "2026-09-01T12:00:00.000Z", assetHours: 1100 },
    });
    expect(rpcs[1].args.p_asset_hours).toBe(1100);
  });

  it("resolves an inspection's asset through its work order", async () => {
    const rpcs: Rpc[] = [];
    await expect(
      recordMeasurements({
        ...context(
          "manager",
          fakeClient({
            inspections: { id: KEY, vehicle_id: null, work_order_id: MEASUREMENT, work_order_line_id: null },
            work_orders: { vehicle_id: OTHER_ASSET },
          }),
          fakeClient({}, rpcs),
        ),
        assetId: ASSET,
        batch: { ...batch, inspectionId: MEASUREMENT },
      }),
    ).rejects.toMatchObject({ status: 400 });
    await recordMeasurements({
      ...context(
        "manager",
        fakeClient({
          inspections: { id: KEY, vehicle_id: null, work_order_id: MEASUREMENT, work_order_line_id: null },
          work_orders: { vehicle_id: ASSET },
        }),
        fakeClient({}, rpcs, [MEASUREMENT]),
      ),
      assetId: ASSET,
      batch: { ...batch, inspectionId: MEASUREMENT },
    });
    expect(rpcs).toHaveLength(1);
  });

  it("refuses roles that cannot record and assets the caller cannot see", async () => {
    await expect(
      recordMeasurements({ ...context("parts", fakeClient({}), fakeClient({})), assetId: ASSET, batch }),
    ).rejects.toMatchObject({ status: 403 });
    mocks.authorize.mockResolvedValue(null);
    await expect(
      recordMeasurements({ ...context("mechanic", fakeClient({}), fakeClient({})), assetId: ASSET, batch }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects a work order or inspection for another asset", async () => {
    const rpcs: Rpc[] = [];
    await expect(
      recordMeasurements({
        ...context("manager", fakeClient({ work_orders: { id: KEY, vehicle_id: OTHER_ASSET } }), fakeClient({}, rpcs)),
        assetId: ASSET,
        batch: { ...batch, workOrderId: MEASUREMENT },
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      recordMeasurements({
        ...context("manager", fakeClient({ inspections: { id: KEY, vehicle_id: OTHER_ASSET } }), fakeClient({}, rpcs)),
        assetId: ASSET,
        batch: { ...batch, inspectionId: MEASUREMENT },
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(rpcs).toEqual([]);
  });
});

describe("correcting measurements", () => {
  const original = {
    id: MEASUREMENT,
    shop_id: SHOP,
    vehicle_id: ASSET,
    measurement_type: "tire_pressure",
    recorded_by: OTHER_USER,
  };

  beforeEach(() => {
    mocks.authorize.mockReset();
    mocks.authorize.mockResolvedValue({ id: ASSET, engineHours: 1400 });
  });

  it("lets managers correct any visible reading, converting the entered unit", async () => {
    const rpcs: Rpc[] = [];
    await correctMeasurement({
      ...context("manager", fakeClient({}), fakeClient({ equipment_measurements: original }, rpcs, KEY)),
      measurementId: MEASUREMENT,
      correction: { void: false, reason: "Gauge misread", operationKey: KEY, enteredValue: 100, enteredUnit: "psi" },
    });
    expect(rpcs[0].args).toMatchObject({
      p_measurement_id: MEASUREMENT,
      p_value: 689.4757,
      p_unit: "kPa",
      p_entered_value: 100,
      p_entered_unit: "psi",
      p_void: false,
    });
  });

  it("limits other recorders to their own readings", async () => {
    await expect(
      correctMeasurement({
        ...context("mechanic", fakeClient({}), fakeClient({ equipment_measurements: original })),
        measurementId: MEASUREMENT,
        correction: { void: true, reason: "Wrong machine", operationKey: KEY },
      }),
    ).rejects.toMatchObject({ status: 403 });
    const rpcs: Rpc[] = [];
    await correctMeasurement({
      ...context("mechanic", fakeClient({}), fakeClient({ equipment_measurements: { ...original, recorded_by: USER } }, rpcs, KEY)),
      measurementId: MEASUREMENT,
      correction: { void: true, reason: "Wrong machine", operationKey: KEY },
    });
    expect(rpcs[0].args).toMatchObject({ p_void: true, p_value: null });
  });

  it("rejects an implausible corrected value", async () => {
    await expect(
      correctMeasurement({
        ...context("manager", fakeClient({}), fakeClient({ equipment_measurements: original })),
        measurementId: MEASUREMENT,
        correction: { void: false, reason: "Typo", operationKey: KEY, enteredValue: -5, enteredUnit: "psi" },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
