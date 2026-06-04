import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/parts/import/route";

const { mockSupabaseState } = vi.hoisted(() => ({
  mockSupabaseState: {
    user: { id: "user-1" } as { id: string } | null,
    profileShopId: "shop-real" as string | null,
    locations: [{ id: "loc-real", shop_id: "shop-real" }] as Array<Record<string, unknown>>,
    parts: [] as Array<Record<string, unknown>>,
    inserts: [] as Array<Record<string, unknown>>,
    updates: [] as Array<{ payload: Record<string, unknown>; filters: Record<string, unknown> }>,
    rpcCalls: [] as Array<Record<string, unknown>>,
  },
}));

vi.mock("next/headers", () => ({ cookies: vi.fn() }));

type MockQuery = {
  filters: Record<string, unknown>;
  payload?: Record<string, unknown>;
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
};

function makeQuery(table: string): MockQuery {
  const query: MockQuery = {
    filters: {},
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => {
      query.filters[column] = value;
      return query;
    }),
    maybeSingle: vi.fn(async () => {
      if (table === "profiles") return { data: { shop_id: mockSupabaseState.profileShopId }, error: null };
      if (table === "stock_locations") {
        const location = mockSupabaseState.locations.find(
          (row) => row.id === query.filters.id && row.shop_id === query.filters.shop_id,
        );
        return { data: location ?? null, error: null };
      }
      if (table === "parts") {
        const part = mockSupabaseState.parts.find(
          (row) => row.sku === query.filters.sku && row.shop_id === query.filters.shop_id,
        );
        return { data: part ? { id: part.id } : null, error: null };
      }
      return { data: null, error: null };
    }),
    insert: vi.fn((payload: Record<string, unknown>) => {
      query.payload = payload;
      mockSupabaseState.inserts.push(payload);
      return query;
    }),
    update: vi.fn((payload: Record<string, unknown>) => {
      query.payload = payload;
      return query;
    }),
    single: vi.fn(async () => ({ data: { id: "created-part" }, error: null })),
  };

  query.eq = vi.fn((column: string, value: unknown) => {
    query.filters[column] = value;
    if (table === "parts" && query.payload && column === "id") {
      mockSupabaseState.updates.push({ payload: query.payload, filters: { ...query.filters } });
    }
    return query;
  });

  return query;
}

vi.mock("@supabase/auth-helpers-nextjs", () => ({
  createRouteHandlerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: mockSupabaseState.user }, error: null })),
    },
    from: vi.fn((table: string) => makeQuery(table)),
    rpc: vi.fn(async (_name: string, args: Record<string, unknown>) => {
      mockSupabaseState.rpcCalls.push(args);
      return { data: null, error: null };
    }),
  })),
}));

describe("POST /api/parts/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseState.user = { id: "user-1" };
    mockSupabaseState.profileShopId = "shop-real";
    mockSupabaseState.locations = [{ id: "loc-real", shop_id: "shop-real" }];
    mockSupabaseState.parts = [];
    mockSupabaseState.inserts = [];
    mockSupabaseState.updates = [];
    mockSupabaseState.rpcCalls = [];
  });

  it("rejects unauthenticated imports", async () => {
    mockSupabaseState.user = null;

    const response = await POST(new Request("http://localhost/api/parts/import", {
      method: "POST",
      body: JSON.stringify({ rows: [{ name: "Oil Filter" }] }),
    }));

    expect(response.status).toBe(401);
  });

  it("derives shop_id from the authenticated profile and ignores client shop_id", async () => {
    const response = await POST(new Request("http://localhost/api/parts/import", {
      method: "POST",
      body: JSON.stringify({
        defaultLocationId: "loc-real",
        rows: [{ name: "Oil Filter", sku: "OF-1", category: "Filters", price: 9.95, qty: 4, shop_id: "evil-shop" }],
      }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.counts).toMatchObject({ importedCount: 1, createdCount: 1, stockReceiveCount: 1 });
    expect(mockSupabaseState.inserts[0]).toMatchObject({ shop_id: "shop-real", name: "Oil Filter", sku: "OF-1" });
    expect(mockSupabaseState.inserts[0].shop_id).not.toBe("evil-shop");
    expect(mockSupabaseState.rpcCalls[0]).toMatchObject({ p_part: "created-part", p_loc: "loc-real", p_qty: 4, p_ref_kind: "csv_import" });
  });

  it("rejects default receive locations outside the authenticated shop", async () => {
    const response = await POST(new Request("http://localhost/api/parts/import", {
      method: "POST",
      body: JSON.stringify({ defaultLocationId: "other-loc", rows: [{ name: "Oil Filter" }] }),
    }));

    expect(response.status).toBe(400);
    expect(mockSupabaseState.inserts).toHaveLength(0);
  });
});
