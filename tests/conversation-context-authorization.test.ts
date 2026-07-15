import { describe, expect, it } from "vitest";
import { authorizeConversationContext } from "../features/chat/server/conversationContext";

type Row = Record<string, unknown>;

function createSupabase(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const query = {
        select() {
          return query;
        },
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return query;
        },
        async maybeSingle() {
          const rows = (tables[table] ?? []).filter((row) =>
            filters.every(([column, value]) => row[column] === value),
          );
          return { data: rows[0] ?? null, error: null };
        },
      };
      return query;
    },
  };
}

describe("conversation context authorization", () => {
  it("accepts a same-shop work order and returns durable context anchors", async () => {
    const supabase = createSupabase({
      work_orders: [
        {
          id: "work-order-a",
          shop_id: "shop-a",
          customer_id: "customer-a",
          vehicle_id: "vehicle-a",
        },
      ],
    });

    const result = await authorizeConversationContext({
      supabase: supabase as never,
      shopId: "shop-a",
      customerId: "customer-a",
      contextType: "work_order",
      contextId: "work-order-a",
    });

    expect(result).toEqual({
      ok: true,
      anchors: expect.objectContaining({
        customer_id: "customer-a",
        work_order_id: "work-order-a",
        vehicle_id: "vehicle-a",
        context_type: "work_order",
        context_id: "work-order-a",
      }),
    });
  });

  it("does not allow a customer conversation to link another customer's work order", async () => {
    const supabase = createSupabase({
      work_orders: [
        {
          id: "work-order-b",
          shop_id: "shop-a",
          customer_id: "customer-b",
          vehicle_id: "vehicle-b",
        },
      ],
    });

    const result = await authorizeConversationContext({
      supabase: supabase as never,
      shopId: "shop-a",
      customerId: "customer-a",
      contextType: "work_order",
      contextId: "work-order-b",
    });

    expect(result).toEqual({
      ok: false,
      status: 403,
      error: "Linked record belongs to another customer",
    });
  });

  it("does not resolve context records from another shop", async () => {
    const supabase = createSupabase({
      vehicles: [
        {
          id: "vehicle-b",
          shop_id: "shop-b",
          customer_id: "customer-b",
        },
      ],
    });

    const result = await authorizeConversationContext({
      supabase: supabase as never,
      shopId: "shop-a",
      customerId: null,
      contextType: "vehicle",
      contextId: "vehicle-b",
    });

    expect(result).toEqual({
      ok: false,
      status: 404,
      error: "Vehicle context not found in this shop",
    });
  });
});
