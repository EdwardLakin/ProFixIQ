import { describe, expect, it, vi } from "vitest";
import type { Database } from "@shared/types/types/supabase";
import { loadPartsRequestQueue } from "@/features/parts/server/loadPartsRequestQueue";

type TableName = keyof Database["public"]["Tables"];
type FilterCall = {
  table: string;
  kind: "eq" | "in";
  column: string;
  value: unknown;
};
type FakeBuilder = {
  select: (columns: string) => FakeBuilder;
  eq: (column: string, value: unknown) => FakeBuilder;
  in: (column: string, values: unknown[]) => FakeBuilder;
  order: (column: string, options?: unknown) => FakeBuilder;
  abortSignal: (signal: AbortSignal) => FakeBuilder;
  range: (
    fromIndex: number,
    toIndex: number,
  ) => Promise<{ data: Array<Record<string, unknown>>; error: null }>;
};

const SHOP_A = "11111111-1111-4111-8111-111111111111";
const SHOP_B = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REQUEST_A = "22222222-2222-4222-8222-222222222222";
const REQUEST_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const WORK_ORDER_A = "33333333-3333-4333-8333-333333333333";
const WORK_ORDER_B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function fakeSupabase() {
  const filters: FilterCall[] = [];
  const tables: Record<string, Array<Record<string, unknown>>> = {
    part_requests: [
      {
        id: REQUEST_A,
        shop_id: SHOP_A,
        work_order_id: WORK_ORDER_A,
        status: "requested",
        created_at: "2026-08-22T12:00:00.000Z",
      },
      {
        id: REQUEST_B,
        shop_id: SHOP_B,
        work_order_id: WORK_ORDER_B,
        status: "requested",
        created_at: "2026-08-22T12:00:00.000Z",
      },
    ],
    part_request_items: [
      {
        id: "item-a",
        shop_id: SHOP_A,
        request_id: REQUEST_A,
        status: "requested",
      },
      {
        id: "item-b",
        shop_id: SHOP_B,
        request_id: REQUEST_B,
        status: "requested",
      },
    ],
    work_orders: [
      { id: WORK_ORDER_A, shop_id: SHOP_A, custom_id: "WO-000014" },
      { id: WORK_ORDER_B, shop_id: SHOP_B, custom_id: "WO-OTHER" },
    ],
    menu_items: [],
  };

  const from = vi.fn((table: TableName) => {
    const localFilters: Array<(row: Record<string, unknown>) => boolean> = [];
    const builder = {} as FakeBuilder;
    Object.assign(builder, {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push({ table, kind: "eq", column, value });
        localFilters.push((row) => row[column] === value);
        return builder;
      }),
      in: vi.fn((column: string, values: unknown[]) => {
        filters.push({ table, kind: "in", column, value: values });
        localFilters.push((row) => values.includes(row[column]));
        return builder;
      }),
      order: vi.fn(() => builder),
      abortSignal: vi.fn(() => builder),
      range: vi.fn((fromIndex: number, toIndex: number) =>
        Promise.resolve({
          data: (tables[table] ?? [])
            .filter((row) => localFilters.every((filter) => filter(row)))
            .slice(fromIndex, toIndex + 1),
          error: null,
        }),
      ),
    });
    return builder;
  });

  return { client: { from }, filters };
}

describe("loadPartsRequestQueue", () => {
  it("scopes every aggregate table to one shop and returns the known active request", async () => {
    const { client, filters } = fakeSupabase();

    const snapshot = await loadPartsRequestQueue({
      supabase: client as never,
      shopId: SHOP_A,
    });

    expect(snapshot.requests.map((row) => row.id)).toEqual([REQUEST_A]);
    expect(snapshot.items.map((row) => row.request_id)).toEqual([REQUEST_A]);
    expect(snapshot.workOrders).toContainEqual(
      expect.objectContaining({ custom_id: "WO-000014" }),
    );
    for (const table of [
      "part_requests",
      "part_request_items",
      "work_orders",
    ]) {
      expect(filters).toContainEqual({
        table,
        kind: "eq",
        column: "shop_id",
        value: SHOP_A,
      });
    }
  });

  it("returns a real empty result without issuing unrelated child queries", async () => {
    const { client } = fakeSupabase();
    const from = client.from;

    const snapshot = await loadPartsRequestQueue({
      supabase: client as never,
      shopId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    });

    expect(snapshot.requests).toEqual([]);
    expect(snapshot.items).toEqual([]);
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("can refresh one request without reading a copied cross-shop ID", async () => {
    const { client } = fakeSupabase();

    const snapshot = await loadPartsRequestQueue({
      supabase: client as never,
      shopId: SHOP_A,
      requestId: REQUEST_B,
    });

    expect(snapshot.requests).toEqual([]);
    expect(snapshot.items).toEqual([]);
  });
});
