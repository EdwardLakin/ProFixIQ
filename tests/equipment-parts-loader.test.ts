import { describe, expect, it, vi } from "vitest";
import { loadEquipmentParts } from "@/features/equipment/parts/server/loadEquipmentParts";
import { equipmentPartsPage } from "@/features/equipment/parts/lib/equipmentParts";
import type { CanonicalRole } from "@/features/shared/lib/rbac";

type Row = Record<string, unknown>;
function fixture(count = 32, fail = "") {
  const tables: Record<string, Row[]> = {
    part_requests: [],
    part_request_items: [],
    work_orders: [],
    equipment_asset_profiles: [],
    menu_items: [],
  };
  for (let i = 0; i < count + 3; i++) {
    const shop = i === count ? "other" : "shop";
    const ordinary = i === count + 1;
    tables.part_requests.push({
      id: `r${i}`,
      shop_id: shop,
      work_order_id: i === count + 2 ? null : `w${i}`,
      status: "requested",
      created_at: "2026-10-17",
    });
    tables.part_request_items.push({
      id: `i${i}`,
      shop_id: shop,
      request_id: `r${i}`,
      description: `Part ${i}`,
      qty: 2,
      qty_requested: 2,
      status: "requested",
      unit_cost: 98765,
      quoted_price: null,
    });
    tables.work_orders.push({
      id: `w${i}`,
      shop_id: shop,
      vehicle_id: `v${i}`,
      custom_id: `WO-${i}`,
    });
    if (!ordinary)
      tables.equipment_asset_profiles.push({
        vehicle_id: `v${i}`,
        shop_id: shop,
      });
  }
  // Same-shop request pointing to another shop's work order and a same-shop
  // work order whose Equipment profile belongs to another tenant both fail closed.
  tables.part_requests.push({
    id: "forged",
    shop_id: "shop",
    work_order_id: `w${count}`,
    status: "requested",
  });
  tables.equipment_asset_profiles.push({
    vehicle_id: `v${count + 1}`,
    shop_id: "other",
  });
  const calls: { table: string; filters: [string, unknown][] }[] = [];
  const from = vi.fn((table: string) => {
    const predicates: ((r: Row) => boolean)[] = [];
    const filters: [string, unknown][] = [];
    calls.push({ table, filters });
    const builder = {
      select: () => builder,
      eq: (key: string, value: unknown) => {
        filters.push([key, value]);
        predicates.push((r) => r[key] === value);
        return builder;
      },
      in: (key: string, values: unknown[]) => {
        filters.push([key, values]);
        predicates.push((r) => values.includes(r[key]));
        return builder;
      },
      order: () => builder,
      abortSignal: () => builder,
      range: async (start: number, end: number) => ({
        data: (tables[table] ?? [])
          .filter((r) => predicates.every((p) => p(r)))
          .slice(start, end + 1),
        error: table === fail ? { message: "fixture failure" } : null,
      }),
    };
    return builder;
  });
  return { client: { from }, calls, tables };
}

describe("Equipment canonical Parts projection", () => {
  it("uses privileged reads only for server-only Equipment identity", async () => {
    const db = fixture(1);
    const session = {
      from: vi.fn((table: string) => {
        if (table === "equipment_asset_profiles")
          throw new Error("client access revoked");
        return db.client.from(table);
      }),
    };
    const admin = {
      from: vi.fn((table: string) => {
        if (table !== "equipment_asset_profiles")
          throw new Error("unexpected privileged read");
        return db.client.from(table);
      }),
    };
    expect(
      await loadEquipmentParts({
        supabase: session as never,
        admin: admin as never,
        shopId: "shop",
        role: "parts",
      }),
    ).toHaveLength(1);
    expect(admin.from).toHaveBeenCalledWith("equipment_asset_profiles");
  });

  it("filters products and tenants before page counts and strips all financial fields", async () => {
    const db = fixture();
    const rows = await loadEquipmentParts({
      supabase: db.client as never,
      admin: db.client as never,
      shopId: "shop",
      role: "parts",
    });
    expect(rows).toHaveLength(32);
    expect(rows.map((r) => r.id)).not.toContain("forged");
    expect(rows.every((r) => r.stage === "needs_quote")).toBe(true);
    expect(equipmentPartsPage(rows, "", "all", 1).rows).toHaveLength(25);
    const next = equipmentPartsPage(rows, "", "all", 2);
    expect(next).toMatchObject({ total: 32, pageCount: 2, page: 2 });
    expect(next.rows).toHaveLength(7);
    expect(
      new Set(
        [...equipmentPartsPage(rows, "", "all", 1).rows, ...next.rows].map(
          (r) => r.id,
        ),
      ).size,
    ).toBe(32);
    expect(JSON.stringify(rows)).not.toMatch(
      /unit_cost|quoted_price|98765|shop_id/,
    );
    expect(
      db.calls.every((c) =>
        c.filters.some(([k, v]) => k === "shop_id" && v === "shop"),
      ),
    ).toBe(true);
    expect(equipmentPartsPage(rows, "WO-31", "needs_quote", 99)).toMatchObject({
      total: 1,
      page: 1,
    });
    expect(equipmentPartsPage(rows, "", "completed", 1).total).toBe(0);
  });
  it("retains all rows across canonical read pagination and identity chunks", async () => {
    const db = fixture(505);
    const rows = await loadEquipmentParts({
      supabase: db.client as never,
      admin: db.client as never,
      shopId: "shop",
      role: "owner",
    });
    expect(rows).toHaveLength(505);
    expect(equipmentPartsPage(rows, "", "all", 21).rows).toHaveLength(5);
  });
  it.each([
    "lead_hand",
    "foreman",
    "advisor",
    "service",
    "mechanic",
    "customer",
    "driver",
    "fleet_manager",
  ])("denies %s before reads", async (role) => {
    const db = fixture();
    await expect(
      loadEquipmentParts({
        supabase: db.client as never,
        admin: db.client as never,
        shopId: "shop",
        role: role as CanonicalRole,
      }),
    ).rejects.toThrow("denied");
    expect(db.client.from).not.toHaveBeenCalled();
  });
  it.each(["owner", "admin", "manager", "parts"])(
    "retains canonical queue access for %s",
    async (role) => {
      const db = fixture(1);
      expect(
        await loadEquipmentParts({
          supabase: db.client as never,
          admin: db.client as never,
          shopId: "shop",
          role: role as CanonicalRole,
        }),
      ).toHaveLength(1);
    },
  );
  it.each([
    "part_requests",
    "part_request_items",
    "work_orders",
    "equipment_asset_profiles",
  ])(
    "propagates %s errors instead of fabricated zero counts",
    async (table) => {
      const db = fixture(1, table);
      await expect(
        loadEquipmentParts({
          supabase: db.client as never,
          admin: db.client as never,
          shopId: "shop",
          role: "owner",
        }),
      ).rejects.toThrow("fixture failure");
    },
  );
});
