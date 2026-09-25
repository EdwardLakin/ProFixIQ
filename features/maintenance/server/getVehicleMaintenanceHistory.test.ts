import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DB } from "./types";
import { getVehicleMaintenanceHistory } from "./getVehicleMaintenanceHistory";

function clientWithLines(lines: Array<Record<string, unknown>>) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => Promise.resolve({ data: lines, error: null }),
  };
  return { from: () => builder } as unknown as SupabaseClient<DB>;
}

const baseLine = {
  vehicle_id: "v1",
  work_order_id: "wo-old",
  service_code: null,
  menu_item_id: null,
  odometer_km: null,
  line_status: "completed",
  status: "completed",
};

describe("getVehicleMaintenanceHistory", () => {
  it("counts hand-typed work, using the completion date and the work order's mileage", async () => {
    const supabase = clientWithLines([
      {
        ...baseLine,
        id: "l1",
        description: "LOF 5W30",
        created_at: "2026-03-01T00:00:00.000Z",
        punched_out_at: "2026-03-04T00:00:00.000Z",
        work_orders: { odometer_km: 120000 },
      },
    ]);

    const history = await getVehicleMaintenanceHistory({
      supabase,
      vehicleId: "v1",
      shopId: "s1",
      serviceCode: "OIL_CHANGE",
      label: "Engine oil & filter change",
    });

    expect(history).toEqual({
      lastCompletedAt: "2026-03-04T00:00:00.000Z",
      lastCompletedMileageKm: 120000,
      historyMatchSource: "text_fallback",
    });
  });

  it("matches legacy line codes through the catalog and ignores unrelated or open work", async () => {
    const supabase = clientWithLines([
      {
        ...baseLine,
        id: "open",
        description: "Oil change",
        line_status: "in_progress",
        status: "in_progress",
        created_at: "2026-05-01T00:00:00.000Z",
        punched_out_at: null,
        work_orders: { odometer_km: 130000 },
      },
      {
        ...baseLine,
        id: "cabin",
        description: "Cabin air filter",
        created_at: "2026-04-01T00:00:00.000Z",
        punched_out_at: null,
        work_orders: { odometer_km: 125000 },
      },
      {
        ...baseLine,
        id: "coded",
        service_code: "engine_air_filter",
        description: "Filter",
        odometer_km: 110000,
        created_at: "2026-01-01T00:00:00.000Z",
        punched_out_at: null,
        work_orders: { odometer_km: 999 },
      },
    ]);

    const history = await getVehicleMaintenanceHistory({
      supabase,
      vehicleId: "v1",
      shopId: "s1",
      serviceCode: "ENGINE_AIR_FILTER",
      label: "Engine air filter replacement",
    });

    expect(history).toEqual({
      lastCompletedAt: "2026-01-01T00:00:00.000Z",
      lastCompletedMileageKm: 110000,
      historyMatchSource: "service_code",
    });
  });
});
