import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  listWorkOrderBoardRowsForActorShop,
  listWorkOrdersForActorShop,
} from "@/features/work-orders/lib/work-orders/listWorkOrders";

type Row = Record<string, any>;
type Operation = { table: string; filters: Record<string, any>; inFilters: Record<string, any[]>; select?: string };

class Query {
  private filters: Record<string, any> = {};
  private inFilters: Record<string, any[]> = {};
  private selectValue?: string;

  constructor(private readonly table: string, private readonly rowsByTable: Record<string, Row[]>, private readonly operations: Operation[]) {}

  select(value: string) {
    this.selectValue = value;
    return this;
  }

  eq(key: string, value: any) {
    this.filters[key] = value;
    return this;
  }

  in(key: string, value: any[]) {
    this.inFilters[key] = value;
    return this;
  }

  is(key: string, value: any) {
    this.filters[key] = value;
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return this;
  }

  then(resolve: (value: { data: Row[]; error: null }) => void) {
    this.operations.push({ table: this.table, filters: { ...this.filters }, inFilters: { ...this.inFilters }, select: this.selectValue });
    let rows = [...(this.rowsByTable[this.table] ?? [])];
    for (const [key, value] of Object.entries(this.filters)) rows = rows.filter((row) => row[key] === value);
    for (const [key, values] of Object.entries(this.inFilters)) rows = rows.filter((row) => values.includes(row[key]));
    resolve({ data: rows, error: null });
  }
}

function createMockSupabase(rowsByTable: Record<string, Row[]>) {
  const operations: Operation[] = [];
  return {
    operations,
    client: {
      from(table: string) {
        return new Query(table, rowsByTable, operations);
      },
    },
  };
}

const shopAWorkOrder = {
  id: "wo-shop-a",
  shop_id: "shop-a",
  customer_id: "customer-a",
  vehicle_id: "vehicle-a",
  custom_id: "RO-100",
  status: "awaiting",
  created_at: "2026-01-01T00:00:00.000Z",
};

const shopBWorkOrder = {
  id: "wo-shop-b",
  shop_id: "shop-b",
  customer_id: "customer-b",
  vehicle_id: "vehicle-b",
  custom_id: "RO-200",
  status: "awaiting",
  created_at: "2026-01-02T00:00:00.000Z",
};

describe("listWorkOrdersForActorShop", () => {
  it("queries by actor profile shop_id, never user_id or client-provided shop_id", async () => {
    const { client, operations } = createMockSupabase({
      work_orders: [shopAWorkOrder, shopBWorkOrder],
      customers: [{ id: "customer-a", shop_id: "shop-a", first_name: "Edward", last_name: "Lakin", phone: null, email: "edward@example.com" }],
      vehicles: [{ id: "vehicle-a", shop_id: "shop-a", year: 2024, make: "Ford", model: "F-150", license_plate: "PFIQ1" }],
      work_order_lines: [],
    });

    const result = await listWorkOrdersForActorShop(client as any, {
      shopId: "shop-a",
      search: "",
      status: "",
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.id).toBe("wo-shop-a");
    expect(operations.find((op) => op.table === "work_orders")?.filters.shop_id).toBe("shop-a");
    expect(operations.some((op) => "user_id" in op.filters)).toBe(false);
    expect(operations.some((op) => op.filters.shop_id === "shop-b")).toBe(false);
  });

  it("renders linked same-shop customer data and same-shop customer search without leaking cross-shop rows", async () => {
    const { client } = createMockSupabase({
      work_orders: [shopAWorkOrder, shopBWorkOrder],
      customers: [
        { id: "customer-a", shop_id: "shop-a", first_name: "Edward", last_name: "Lakin", phone: "555", email: "edward@example.com" },
        { id: "customer-b", shop_id: "shop-b", first_name: "Mallory", last_name: "Cross", phone: "555", email: "mallory@example.com" },
      ],
      vehicles: [{ id: "vehicle-a", shop_id: "shop-a", year: 2024, make: "Ford", model: "F-150", license_plate: "PFIQ1" }],
      work_order_lines: [],
    });

    const result = await listWorkOrdersForActorShop(client as any, { shopId: "shop-a", search: "edward" });

    expect(result.rows.map((row) => row.id)).toEqual(["wo-shop-a"]);
    expect(result.rows[0]?.customers?.first_name).toBe("Edward");
    expect(JSON.stringify(result.rows)).not.toContain("Mallory");
  });

  it("renders work orders when customer_id is null or the same-shop customer lookup has no match", async () => {
    const { client } = createMockSupabase({
      work_orders: [
        { ...shopAWorkOrder, id: "wo-null-customer", customer_id: null },
        { ...shopAWorkOrder, id: "wo-missing-customer", customer_id: "missing-customer" },
      ],
      customers: [],
      vehicles: [],
      work_order_lines: [],
    });

    const result = await listWorkOrdersForActorShop(client as any, { shopId: "shop-a" });

    expect(result.rows).toHaveLength(2);
    expect(result.rows.every((row) => row.customers === null)).toBe(true);
  });

  it("preserves line rollups for whatever access the current same-shop policy allows", async () => {
    const { client } = createMockSupabase({
      work_orders: [shopAWorkOrder],
      customers: [],
      vehicles: [],
      work_order_lines: [
        { id: "line-1", shop_id: "shop-a", work_order_id: "wo-shop-a", status: "in_progress", assigned_tech_id: "tech-1" },
      ],
      work_order_line_technicians: [],
    });

    const result = await listWorkOrdersForActorShop(client as any, { shopId: "shop-a" });

    expect(result.techRollupByWo["wo-shop-a"]).toBe("in_progress");
    expect(result.assignedByWo["wo-shop-a"]).toBe(true);
    expect(result.hasLinesByWo["wo-shop-a"]).toBe(true);
  });
});

describe("listWorkOrderBoardRowsForActorShop", () => {
  it("scopes board rows to the actor shop_id", async () => {
    const { client, operations } = createMockSupabase({
      v_work_order_board_cards_shop: [
        { work_order_id: "wo-shop-a", shop_id: "shop-a", custom_id: "RO-100" },
        { work_order_id: "wo-shop-b", shop_id: "shop-b", custom_id: "RO-200" },
      ],
    });

    const rows = await listWorkOrderBoardRowsForActorShop(client as any, { shopId: "shop-a", variant: "shop" });

    expect(rows.map((row) => row.work_order_id)).toEqual(["wo-shop-a"]);
    expect(operations[0]?.filters.shop_id).toBe("shop-a");
  });
});

describe("work order RLS regression guard", () => {
  it("does not introduce auth-helpers on the fixed work order loading path", () => {
    const files = [
      "app/api/work-orders/list/route.ts",
      "app/api/work-order-board/route.ts",
      "features/shared/hooks/useWorkOrderBoard.ts",
      "features/work-orders/lib/work-orders/listWorkOrders.ts",
    ];

    for (const file of files) {
      const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
      expect(source).not.toContain("@supabase/auth-helpers-nextjs");
    }
  });
});

describe("work order list route auth pattern", () => {
  it("resolves owner/admin/lower-role access from the authenticated actor profile instead of request shop_id", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "app/api/work-orders/list/route.ts"), "utf8");

    expect(source).toContain("resolveCurrentActor(userSupabase)");
    expect(source).toContain("shopId: actor.shopId");
    expect(source).not.toContain('url.searchParams.get("shopId")');
    expect(source).not.toContain('url.searchParams.get("shop_id")');
  });
});
