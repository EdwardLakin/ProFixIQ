import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  loadMeasurements: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/equipment/server/equipmentAssetProfileService", () => ({
  authorizeEquipmentAsset: mocks.authorize,
  EquipmentAssetProfileError: class extends Error {},
}));
vi.mock("@/features/equipment/server/equipmentMeasurementService", () => ({
  loadAssetMeasurements: mocks.loadMeasurements,
  EquipmentMeasurementError: class extends Error {},
}));

import type { MeasurementSeries } from "@/features/equipment/lib/measurements";
import {
  percentWorn,
  validateWearLimit,
  wearReading,
  type WearLimit,
} from "@/features/equipment/lib/undercarriage";
import {
  loadUndercarriage,
  setWearLimit,
} from "@/features/equipment/server/equipmentUndercarriageService";

const SHOP = "00000000-0000-4000-8000-000000000111";
const USER = "00000000-0000-4000-8000-000000000222";
const ASSET = "00000000-0000-4000-8000-000000000001";
const SIDE = "00000000-0000-4000-8000-0000000000a1";
const CHAIN = "00000000-0000-4000-8000-0000000000a2";
const SHOES = "00000000-0000-4000-8000-0000000000a3";

const linkLimit: WearLimit = {
  id: "l1",
  componentId: CHAIN,
  measurementType: "track_link_height",
  unit: "mm",
  newValue: 104,
  limitValue: 92,
  reference: "OEM manual",
  setAt: "2026-10-01T00:00:00Z",
};

function series(points: Array<{ value: number; hours: number | null; at: string }>, patch: Partial<MeasurementSeries> = {}): MeasurementSeries {
  const mapped = points.map((point, index) => ({
    id: `p${index}`,
    originalId: `p${index}`,
    value: point.value,
    unit: "mm",
    enteredValue: point.value,
    enteredUnit: "mm",
    assetHours: point.hours,
    measuredAt: point.at,
    notes: null,
    corrected: false,
    correctionReason: null,
    recordedBy: USER,
    workOrderId: null,
    inspectionId: null,
    asset: null,
  }));
  return {
    key: "k",
    measurementType: "track_link_height",
    position: "left",
    componentId: CHAIN,
    componentName: "Track chain",
    label: "Track link height",
    points: mapped,
    latest: mapped[0],
    previous: mapped[1] ?? null,
    change: null,
    hoursBetween: null,
    changePer100Hours: null,
    ...patch,
  };
}

describe("wear arithmetic", () => {
  it("handles dimensions that shrink and grow with wear", () => {
    expect(percentWorn(98, { newValue: 104, limitValue: 92 })).toBe(50);
    expect(percentWorn(104, { newValue: 104, limitValue: 92 })).toBe(0);
    expect(percentWorn(90, { newValue: 104, limitValue: 92 })).toBe(116.7);
    // Pitch elongation: grows from 203 to 209.
    expect(percentWorn(206, { newValue: 203, limitValue: 209 })).toBe(50);
  });

  it("derives the measured wear rate and the arithmetic hours to 100 %", () => {
    const reading = wearReading(
      series([
        { value: 98, hours: 2000, at: "2026-10-01T12:00:00Z" },
        { value: 101, hours: 1500, at: "2026-07-01T12:00:00Z" },
      ]),
      linkLimit,
    );
    expect(reading.wornPercent).toBe(50);
    expect(reading.wornPer100Hours).toBe(5);
    expect(reading.hoursToLimitAtRate).toBe(1000);
  });

  it("reports no rate without a limit, hours or wear", () => {
    expect(wearReading(series([{ value: 98, hours: 2000, at: "2026-10-01T12:00:00Z" }]), null)).toMatchObject({
      wornPercent: null,
      wornPer100Hours: null,
      hoursToLimitAtRate: null,
    });
    const notWearing = wearReading(
      series([
        { value: 101, hours: 2000, at: "2026-10-01T12:00:00Z" },
        { value: 98, hours: 1500, at: "2026-07-01T12:00:00Z" },
      ]),
      linkLimit,
    );
    expect(notWearing.hoursToLimitAtRate).toBeNull();
  });
});

describe("wear limit validation", () => {
  it("converts units and keeps the canonical unit", () => {
    const result = validateWearLimit(
      { measurementType: "track_link_height", newValue: "4.1", limitValue: "3.6", unit: "in", reference: " OEM p.12 " },
      "track_chain",
    );
    expect(result.ok && result.value).toMatchObject({ unit: "mm", newValue: 104.14, limitValue: 91.44, reference: "OEM p.12" });
  });

  it("rejects measurements that do not apply, equal values and implausible values", () => {
    expect(validateWearLimit({ measurementType: "tire_pressure", newValue: 1, limitValue: 2, unit: "kPa" }, "track_chain").ok).toBe(false);
    expect(validateWearLimit({ measurementType: "track_link_height", newValue: 100, limitValue: 100, unit: "mm" }, "track_chain").ok).toBe(false);
    expect(validateWearLimit({ measurementType: "track_link_height", newValue: -5, limitValue: 90, unit: "mm" }, "track_chain").ok).toBe(false);
  });
});

type Tables = Record<string, Array<Record<string, unknown>>>;

function fakeAdmin(tables: Tables, rpcs: Array<{ name: string; args: Record<string, unknown> }> = []) {
  return {
    from(table: string) {
      const filters: Array<(row: Record<string, unknown>) => boolean> = [];
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
        limit: () => builder,
        maybeSingle: async () => ({
          data: (tables[table] ?? []).find((row) => filters.every((filter) => filter(row))) ?? null,
          error: null,
        }),
        then: (resolve: (value: unknown) => void) =>
          resolve({ data: (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row))), error: null }),
      };
      return builder;
    },
    async rpc(name: string, args: Record<string, unknown>) {
      rpcs.push({ name, args });
      return { data: "new-limit", error: null };
    },
  };
}

const components = [
  { id: SIDE, shop_id: SHOP, installed_vehicle_id: ASSET, component_type: "undercarriage", position: "left", label: "Undercarriage — Left", serial_number: null, parent_component_id: null },
  { id: SHOES, shop_id: SHOP, installed_vehicle_id: ASSET, component_type: "track_shoes", position: "left", label: "Track shoes — Left", serial_number: null, parent_component_id: SIDE },
  { id: CHAIN, shop_id: SHOP, installed_vehicle_id: ASSET, component_type: "track_chain", position: "left", label: "Track chain — Left", serial_number: "TC-1", parent_component_id: SIDE },
  { id: "engine", shop_id: SHOP, installed_vehicle_id: ASSET, component_type: "engine", position: null, label: "Engine", serial_number: null, parent_component_id: null },
];

describe("undercarriage service", () => {
  beforeEach(() => {
    mocks.authorize.mockReset();
    mocks.loadMeasurements.mockReset();
  });

  it("groups parts under their side with readings and current limits", async () => {
    mocks.loadMeasurements.mockResolvedValue({
      assetHours: 2000,
      components: [],
      series: [
        series([
          { value: 98, hours: 2000, at: "2026-10-01T12:00:00Z" },
          { value: 101, hours: 1500, at: "2026-07-01T12:00:00Z" },
        ]),
      ],
    });
    const result = await loadUndercarriage({
      supabase: {} as never,
      admin: fakeAdmin({
        equipment_components: components,
        equipment_wear_limits: [
          { id: "l1", shop_id: SHOP, component_id: CHAIN, measurement_type: "track_link_height", unit: "mm", new_value: 104, limit_value: 92, reference: null, created_at: "2026-10-01T00:00:00Z" },
        ],
      }) as never,
      shopId: SHOP,
      role: "mechanic",
      assetId: ASSET,
    });
    expect(result?.sides).toHaveLength(1);
    const side = result!.sides[0];
    expect(side.sideComponentId).toBe(SIDE);
    expect(side.parts.map((part) => part.componentType)).toEqual(["undercarriage", "track_chain", "track_shoes"]);
    const chain = side.parts.find((part) => part.componentId === CHAIN)!;
    expect(chain.readings[0]).toMatchObject({
      measurementType: "track_link_height",
      reading: { wornPercent: 50, hoursToLimitAtRate: 1000 },
      limit: { newValue: 104, limitValue: 92 },
    });
    expect(chain.readings[1]).toMatchObject({ measurementType: "track_pitch", reading: null, limit: null });
  });

  it("returns null for an asset the caller cannot see", async () => {
    mocks.loadMeasurements.mockResolvedValue(null);
    const result = await loadUndercarriage({
      supabase: {} as never,
      admin: fakeAdmin({}) as never,
      shopId: SHOP,
      role: "mechanic",
      assetId: ASSET,
    });
    expect(result).toBeNull();
  });

  it("lets managers version a limit on a visible undercarriage component", async () => {
    mocks.authorize.mockResolvedValue({ id: ASSET });
    const rpcs: Array<{ name: string; args: Record<string, unknown> }> = [];
    await setWearLimit({
      supabase: {} as never,
      admin: fakeAdmin({ equipment_components: components }, rpcs) as never,
      shopId: SHOP,
      role: "manager",
      actorUserId: USER,
      componentId: CHAIN,
      body: { measurementType: "track_link_height", newValue: 104, limitValue: 92, unit: "mm" },
    });
    expect(rpcs[0]).toMatchObject({
      name: "equipment_wear_limit_set",
      args: { p_component_id: CHAIN, p_new_value: 104, p_limit_value: 92, p_unit: "mm" },
    });
  });

  it("refuses non-managers, non-undercarriage components and invisible assets", async () => {
    const context = (patch: Record<string, unknown>) => ({
      supabase: {} as never,
      admin: fakeAdmin({ equipment_components: components }) as never,
      shopId: SHOP,
      role: "manager" as const,
      actorUserId: USER,
      componentId: CHAIN,
      body: { measurementType: "track_link_height", newValue: 104, limitValue: 92, unit: "mm" },
      ...patch,
    });
    await expect(setWearLimit(context({ role: "mechanic" }))).rejects.toMatchObject({ status: 403 });
    await expect(setWearLimit(context({ componentId: "engine" }))).rejects.toMatchObject({ status: 400 });
    mocks.authorize.mockResolvedValue(null);
    await expect(setWearLimit(context({}))).rejects.toMatchObject({ status: 404 });
  });
});
