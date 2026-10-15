import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadEquipmentEvidence } from "@/features/equipment/server/equipmentEvidence";

const SHOP = "00000000-0000-4000-8000-000000000111";
const ASSET = "00000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-10-12T12:00:00Z");

type Row = Record<string, unknown>;

function fakeClient(tables: Record<string, Row[]>, log: string[], name: string) {
  return {
    from(table: string) {
      log.push(`${name}:${table}`);
      const filters: Array<(row: Row) => boolean> = [];
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
        gte: () => builder,
        order: () => builder,
        range: () => builder,
        then: (resolve: (value: unknown) => void) =>
          resolve({
            data: (tables[table] ?? []).filter((row) => filters.every((f) => f(row))),
            error: null,
          }),
      };
      return builder;
    },
  } as never;
}

const WORK_ORDER = {
  id: "wo-1",
  shop_id: SHOP,
  vehicle_id: ASSET,
  status: "in_progress",
  record_type: "work_order",
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
  odometer_km: 900,
};
const tables = {
  work_orders: [WORK_ORDER],
  work_order_lines: [],
  maintenance_suggestions: [],
  inspections: [],
  bookings: [],
};

describe("loadEquipmentEvidence client routing", () => {
  it("reads everything through the caller's client when no privileged client is given", async () => {
    const log: string[] = [];
    const evidence = await loadEquipmentEvidence({
      supabase: fakeClient(tables, log, "scoped"),
      shopId: SHOP,
      assetIds: [ASSET],
      now: NOW,
    });
    expect(log.every((entry) => entry.startsWith("scoped:"))).toBe(true);
    expect(evidence.get(ASSET)?.workOrders).toHaveLength(1);
  });

  it("reads only work orders, lines and suggestions privileged; inspections and bookings stay on the caller's client", async () => {
    const log: string[] = [];
    // The caller's RLS client sees none of the restricted work-order tables.
    const restricted = { ...tables, work_orders: [], work_order_lines: [], maintenance_suggestions: [] };
    const evidence = await loadEquipmentEvidence({
      supabase: fakeClient(restricted, log, "scoped"),
      privileged: fakeClient(tables, log, "admin"),
      shopId: SHOP,
      assetIds: [ASSET],
      now: NOW,
    });
    expect(log.filter((entry) => entry.startsWith("admin:"))).toContain("admin:work_orders");
    expect(log.filter((entry) => entry.startsWith("scoped:")).sort()).toEqual(
      ["scoped:bookings", "scoped:inspections"].sort(),
    );
    expect(evidence.get(ASSET)?.workOrders.map((row) => row.id)).toEqual(["wo-1"]);
    expect(evidence.get(ASSET)?.workOrderOdometerKm).toBe(900);
  });

  it("keeps privileged work-order reads scoped to the shop", async () => {
    const log: string[] = [];
    const otherShop = { ...WORK_ORDER, id: "wo-other", shop_id: "00000000-0000-4000-8000-0000000009ff" };
    const evidence = await loadEquipmentEvidence({
      supabase: fakeClient({ ...tables, work_orders: [] }, log, "scoped"),
      privileged: fakeClient({ ...tables, work_orders: [WORK_ORDER, otherShop] }, log, "admin"),
      shopId: SHOP,
      assetIds: [ASSET],
      now: NOW,
    });
    expect(evidence.get(ASSET)?.workOrders.map((row) => row.id)).toEqual(["wo-1"]);
  });
});
