import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DB } from "./types";
import { computeMaintenanceSuggestionsForWorkOrder } from "./computeMaintenanceSuggestions";
import { generateMaintenanceRulesForVehicle } from "./generateMaintenanceRules";
import { resolveMaintenanceMenuMap } from "./resolveMaintenanceMenuMap";
import { getVehicleMaintenanceHistory } from "./getVehicleMaintenanceHistory";

vi.mock("./generateMaintenanceRules", () => ({
  generateMaintenanceRulesForVehicle: vi.fn(async () => ({
    servicesInserted: 0,
    rulesInserted: 0,
  })),
}));

vi.mock("./resolveMaintenanceMenuMap", () => ({
  resolveMaintenanceMenuMap: vi.fn(async (opts: { serviceCode: string }) => ({
    serviceCode: opts.serviceCode,
    menuItemId: null,
    menuRepairItemId: null,
    mappingSource: "none" as const,
  })),
}));

const adminClient = { admin: true };
vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: vi.fn(() => adminClient),
}));

vi.mock("./getVehicleMaintenanceHistory", () => ({
  getVehicleMaintenanceHistory: vi.fn(async () => ({
    lastCompletedAt: null,
    lastCompletedMileageKm: null,
    historyMatchSource: null,
  })),
}));

class FakeBuilder {
  constructor(private result: { data: unknown; error: unknown }) {}
  select() {
    return this;
  }
  eq() {
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  maybeSingle() {
    return Promise.resolve(this.result);
  }
  upsert() {
    return Promise.resolve({ error: null });
  }
  then(
    onfulfilled: (value: { data: unknown; error: unknown }) => unknown,
    onrejected?: (reason: unknown) => unknown,
  ) {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

const workOrderRow = {
  id: "wo-1",
  shop_id: "shop-1",
  vehicle_id: "vehicle-1",
  odometer_km: 50000,
  created_at: "2024-01-01T00:00:00.000Z",
};

function makeSupabase(opts: {
  vehicle: Record<string, unknown>;
  services: Array<Record<string, unknown>>;
  rules: Array<Record<string, unknown>>;
}) {
  const tables: Record<string, FakeBuilder> = {
    work_orders: new FakeBuilder({ data: workOrderRow, error: null }),
    vehicles: new FakeBuilder({ data: opts.vehicle, error: null }),
    maintenance_services: new FakeBuilder({ data: opts.services, error: null }),
    maintenance_rules: new FakeBuilder({ data: opts.rules, error: null }),
    maintenance_suggestions: new FakeBuilder({ data: null, error: null }),
  };

  return {
    from: vi.fn((table: string) => {
      const builder = tables[table];
      if (!builder) throw new Error(`Unexpected table: ${table}`);
      return builder;
    }),
  } as unknown as SupabaseClient<DB>;
}

const oilChangeService = {
  code: "OIL_CHANGE",
  label: "Engine oil & filter change",
  default_job_type: "maintenance",
  default_labor_hours: 0.8,
  default_notes: "Routine maintenance.",
};

const genericOilChangeRule = {
  id: "rule-generic",
  service_code: "OIL_CHANGE",
  make: null,
  model: null,
  engine_family: null,
  year_from: 2000,
  year_to: 2025,
  distance_km_normal: 8000,
  distance_km_severe: 6000,
  time_months_normal: 6,
  time_months_severe: 3,
  first_due_km: 1000,
  first_due_months: 1,
  is_critical: false,
};

const vehicleSpecificOilChangeRule = {
  ...genericOilChangeRule,
  id: "rule-specific",
  make: "Manac",
  model: "Flatbed",
};

describe("computeMaintenanceSuggestionsForWorkOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates a vehicle-specific schedule for the exact year/make/model on the vehicle", async () => {
    const supabase = makeSupabase({
      vehicle: {
        id: "vehicle-1",
        year: 2019,
        make: "Manac",
        model: "Flatbed",
        mileage: null,
        engine_family: null,
      },
      services: [oilChangeService],
      rules: [genericOilChangeRule],
    });

    await computeMaintenanceSuggestionsForWorkOrder({ supabase, workOrderId: "wo-1" });

    expect(generateMaintenanceRulesForVehicle).toHaveBeenCalledWith(
      expect.objectContaining({
        year: 2019,
        make: "Manac",
        model: "Flatbed",
        engineFamily: null,
        writeClient: adminClient,
        timeoutMs: 8000,
      }),
    );
  });

  it("does not attempt generation when the vehicle is missing make/model/year", async () => {
    const supabase = makeSupabase({
      vehicle: {
        id: "vehicle-1",
        year: null,
        make: null,
        model: null,
        mileage: null,
        engine_family: null,
      },
      services: [oilChangeService],
      rules: [genericOilChangeRule],
    });

    await computeMaintenanceSuggestionsForWorkOrder({ supabase, workOrderId: "wo-1" });

    expect(generateMaintenanceRulesForVehicle).not.toHaveBeenCalled();
  });

  it("suppresses generic make-less rules once the vehicle has its own matching rule", async () => {
    const supabase = makeSupabase({
      vehicle: {
        id: "vehicle-1",
        year: 2019,
        make: "Manac",
        model: "Flatbed",
        mileage: null,
        engine_family: null,
      },
      services: [oilChangeService],
      rules: [genericOilChangeRule, vehicleSpecificOilChangeRule],
    });

    const { suggestions } = await computeMaintenanceSuggestionsForWorkOrder({
      supabase,
      workOrderId: "wo-1",
    });

    expect(suggestions).toHaveLength(1);
    expect(vi.mocked(getVehicleMaintenanceHistory)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(resolveMaintenanceMenuMap)).toHaveBeenCalledTimes(1);
  });

  it("keeps generic rules when the vehicle has no vehicle-specific match", async () => {
    const supabase = makeSupabase({
      vehicle: {
        id: "vehicle-1",
        year: 2019,
        make: "Manac",
        model: "Flatbed",
        mileage: null,
        engine_family: null,
      },
      services: [oilChangeService],
      rules: [genericOilChangeRule],
    });

    const { suggestions } = await computeMaintenanceSuggestionsForWorkOrder({
      supabase,
      workOrderId: "wo-1",
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].serviceCode).toBe("OIL_CHANGE");
  });
});
