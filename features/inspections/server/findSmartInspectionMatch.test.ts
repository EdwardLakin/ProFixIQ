import { describe, expect, it } from "vitest";
import { findSmartInspectionMatch } from "./findSmartInspectionMatch";

class Query<T> implements PromiseLike<{ data: T[]; error: null }> {
  constructor(private readonly rows: T[]) {}
  select(): this { return this; }
  eq(): this { return this; }
  order(): this { return this; }
  limit(): this { return this; }
  then<TResult1 = { data: T[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: T[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    _onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.rows, error: null }).then(onfulfilled ?? undefined);
  }
}

function supabaseWith(tables: Record<string, unknown[]>) {
  return {
    from(table: string) {
      return new Query(tables[table] ?? []);
    },
  };
}

describe("findSmartInspectionMatch", () => {
  it("matches brake fluid findings to authored Brake Fluid Flush menu items", async () => {
    const match = await findSmartInspectionMatch({
      supabase: supabaseWith({
        menu_items: [
          { id: "menu-brake-fluid", name: "Brake Fluid Flush", labor_hours: 1, total_price: 149, is_active: true },
        ],
      }) as never,
      shopId: "shop-1",
      body: { item: "Brake fluid", notes: "Fluid dark / recommend service", section: "Brakes", status: "recommend" },
    });

    expect(match?.sourceType).toBe("catalog_menu");
    expect(match?.menuItemId).toBe("menu-brake-fluid");
    expect(match?.menuRepairItemId).toBeNull();
  });

  it("lets a clear authored service beat a weak learned repair", async () => {
    const match = await findSmartInspectionMatch({
      supabase: supabaseWith({
        menu_repair_items: [
          { id: "weak-history", name: "Brake inspection", complaint: "brake check", confidence_score: 0.3 },
        ],
        menu_items: [
          { id: "menu-brake-fluid", name: "Brake Fluid Flush", labor_hours: 1, total_price: 149, is_active: true },
        ],
      }) as never,
      shopId: "shop-1",
      body: { item: "Brake fluid", notes: "dark fluid", section: "Brakes", status: "fail" },
    });

    expect(match?.sourceType).toBe("catalog_menu");
    expect(match?.menuItemId).toBe("menu-brake-fluid");
  });

  it("preserves strong compatible learned repairs ahead of authored services", async () => {
    const match = await findSmartInspectionMatch({
      supabase: supabaseWith({
        menu_repair_items: [
          { id: "front-pads", name: "Front Brake Pad and Rotor Replacement", complaint: "front pads worn", confidence_score: 0.95, vehicle_make: "Ford", vehicle_model: "F-150" },
        ],
        menu_items: [
          { id: "menu-brake", name: "Brake Service", labor_hours: 1, total_price: 99, is_active: true },
        ],
      }) as never,
      shopId: "shop-1",
      body: { item: "Front pads", notes: "front pads worn", section: "Brakes", status: "fail", vehicle: { make: "Ford", model: "F-150" } },
    });

    expect(match?.sourceType).toBe("history_repair");
    expect(match?.menuRepairItemId).toBe("front-pads");
    expect(match?.menuItemId).toBeNull();
  });

  it("blocks diesel/DEF suggestions for gasoline vehicles and returns null safely", async () => {
    const match = await findSmartInspectionMatch({
      supabase: supabaseWith({
        menu_repair_items: [
          { id: "def", name: "DEF Service", complaint: "diesel exhaust fluid", confidence_score: 0.95, fuel_type: "diesel" },
        ],
      }) as never,
      shopId: "shop-1",
      body: { item: "DEF", notes: "DEF warning", section: "Fluids", status: "fail", vehicle: { fuel_type: "gasoline" } },
    });

    expect(match).toBeNull();
  });
});
