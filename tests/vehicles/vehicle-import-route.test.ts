import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../app/api/vehicles/import/route";

const { mockSupabaseState } = vi.hoisted(() => ({
  mockSupabaseState: {
    user: { id: "user-1" } as { id: string } | null,
    profileShopId: "shop-real" as string | null,
    customers: [] as Array<Record<string, unknown>>,
    vehicles: [] as Array<Record<string, unknown>>,
    inserts: [] as Array<Record<string, unknown>>,
    updates: [] as Array<{ payload: Record<string, unknown>; filters: Record<string, unknown> }>,
  },
}));

vi.mock("next/headers", () => ({ cookies: vi.fn() }));

type MockQuery = {
  filters: Record<string, unknown>;
  payload?: Record<string, unknown>;
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  ilike: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

function makeQuery(table: string): MockQuery {
  const query: MockQuery = {
    filters: {},
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => { query.filters[column] = value; return query; }),
    ilike: vi.fn((column: string, value: unknown) => { query.filters[column] = value; return query; }),
    limit: vi.fn(() => {
      if (table === "customers" && query.filters.shop_id && !query.filters.id) {
        return Promise.resolve({ data: mockSupabaseState.customers.filter((row) => row.shop_id === query.filters.shop_id), error: null });
      }
      return query;
    }),
    maybeSingle: vi.fn(async () => {
      if (table === "profiles") return { data: { shop_id: mockSupabaseState.profileShopId }, error: null };
      if (table === "customers") {
        const found = mockSupabaseState.customers.find((row) => row.id === query.filters.id && row.shop_id === query.filters.shop_id);
        return { data: found ?? null, error: null };
      }
      if (table === "vehicles") {
        const found = mockSupabaseState.vehicles.find((row) => {
          if (row.shop_id !== query.filters.shop_id) return false;
          if (query.filters.vin) return row.vin === query.filters.vin;
          if (query.filters.unit_number) return String(row.unit_number).toLowerCase() === String(query.filters.unit_number).toLowerCase();
          if (query.filters.license_plate) return row.license_plate === query.filters.license_plate;
          return false;
        });
        return { data: found ?? null, error: null };
      }
      return { data: null, error: null };
    }),
    insert: vi.fn(async (payload: Record<string, unknown>) => {
      mockSupabaseState.inserts.push(payload);
      mockSupabaseState.vehicles.push({ id: `vehicle-${mockSupabaseState.vehicles.length + 1}`, ...payload });
      return { error: null };
    }),
    update: vi.fn((payload: Record<string, unknown>) => {
      query.payload = payload;
      return query;
    }),
  };
  query.eq = vi.fn((column: string, value: unknown) => {
    query.filters[column] = value;
    if (table === "vehicles" && query.payload && column === "id") {
      mockSupabaseState.updates.push({ payload: query.payload, filters: { ...query.filters } });
    }
    return query;
  });
  query.select = vi.fn(() => query);
  return query;
}

vi.mock("@supabase/auth-helpers-nextjs", () => ({
  createRouteHandlerClient: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: mockSupabaseState.user }, error: null })) },
    from: vi.fn((table: string) => makeQuery(table)),
  })),
}));

function request(rows: unknown[]) {
  return new Request("http://localhost/api/vehicles/import", { method: "POST", body: JSON.stringify({ rows, shop_id: "evil-shop" }) });
}

describe("POST /api/vehicles/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseState.user = { id: "user-1" };
    mockSupabaseState.profileShopId = "shop-real";
    mockSupabaseState.customers = [];
    mockSupabaseState.vehicles = [];
    mockSupabaseState.inserts = [];
    mockSupabaseState.updates = [];
  });

  it("rejects unauthenticated import", async () => {
    mockSupabaseState.user = null;
    const response = await POST(request([{ unit_number: "A-1" }]));
    expect(response.status).toBe(401);
  });

  it("rejects no-shop profiles", async () => {
    mockSupabaseState.profileShopId = null;
    const response = await POST(request([{ unit_number: "A-1" }]));
    expect(response.status).toBe(403);
  });

  it("ignores client shop_id and inserts into authenticated shop", async () => {
    const response = await POST(request([{ unit_number: "A-1", vin: "1hgcm82633a004352" }]));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.counts.created).toBe(1);
    expect(mockSupabaseState.inserts[0]).toMatchObject({ shop_id: "shop-real", user_id: "user-1", unit_number: "A-1", vin: "1HGCM82633A004352" });
    expect(mockSupabaseState.inserts[0].shop_id).not.toBe("evil-shop");
  });

  it("rejects cross-shop customer_id", async () => {
    mockSupabaseState.customers = [{ id: "customer-1", shop_id: "other-shop" }];
    const response = await POST(request([{ unit_number: "A-1", customer_id: "customer-1" }]));
    const payload = await response.json();
    expect(response.status).toBe(400);
    expect(payload.errors[0].message).toMatch(/does not belong/i);
    expect(mockSupabaseState.inserts).toHaveLength(0);
  });

  it("customer email/name lookup is shop scoped", async () => {
    mockSupabaseState.customers = [
      { id: "other-customer", shop_id: "other-shop", email: "jane@example.com", name: "Jane" },
      { id: "real-customer", shop_id: "shop-real", email: "jane@example.com", name: "Jane" },
    ];
    const response = await POST(request([{ unit_number: "A-1", customer_email: "jane@example.com", customer_name: "Jane" }]));
    expect(response.status).toBe(200);
    expect(mockSupabaseState.inserts[0].customer_id).toBe("real-customer");
  });

  it("duplicate VIN is not inserted twice", async () => {
    const response = await POST(request([{ vin: "1HGCM82633A004352" }, { vin: "1HGCM82633A004352" }]));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.counts).toMatchObject({ created: 1, skipped: 1 });
    expect(mockSupabaseState.inserts).toHaveLength(1);
  });

  it("duplicate unit number is handled/skipped", async () => {
    const response = await POST(request([{ unit_number: "A-1" }, { unit_number: "a-1" }]));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.counts).toMatchObject({ created: 1, skipped: 1 });
    expect(mockSupabaseState.inserts).toHaveLength(1);
  });
});
