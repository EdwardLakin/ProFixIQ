import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVehicleAction } from "@/features/vehicles/app/vehicles/actions";

const { mockSupabaseState } = vi.hoisted(() => ({
  mockSupabaseState: {
    user: { id: "user-1" } as { id: string } | null,
    profileShopId: "shop-real" as string | null,
    customers: [] as Array<Record<string, unknown>>,
    vehicles: [] as Array<Record<string, unknown>>,
    inserts: [] as Array<Record<string, unknown>>,
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

function makeQuery(table: string) {
  const filters: Record<string, unknown> = {};
  const query: Record<string, ReturnType<typeof vi.fn>> = {
    select: vi.fn(() => query),
    or: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => {
      filters[column] = value;
      return query;
    }),
    ilike: vi.fn((column: string, value: unknown) => {
      filters[column] = value;
      return query;
    }),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(async () => {
      if (table === "profiles") return { data: mockSupabaseState.profileShopId ? { shop_id: mockSupabaseState.profileShopId, role: "advisor" } : { shop_id: null, role: "advisor" }, error: null };
      if (table === "customers") {
        const found = mockSupabaseState.customers.find((row) => row.id === filters.id && row.shop_id === filters.shop_id);
        return { data: found ? { id: found.id } : null, error: null };
      }
      if (table === "vehicles") {
        const found = mockSupabaseState.vehicles.find((row) => {
          if (row.shop_id !== filters.shop_id) return false;
          if (filters.vin) return row.vin === filters.vin;
          if (filters.unit_number) return String(row.unit_number).toLowerCase() === String(filters.unit_number).toLowerCase();
          return false;
        });
        return { data: found ? { id: found.id } : null, error: null };
      }
      return { data: null, error: null };
    }),
    insert: vi.fn(async (payload: Record<string, unknown>) => {
      mockSupabaseState.inserts.push(payload);
      return { error: null };
    }),
  };
  return query;
}

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createServerSupabaseRSC: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: mockSupabaseState.user }, error: null })) },
    from: vi.fn((table: string) => makeQuery(table)),
  })),
}));

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("createVehicleAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseState.user = { id: "user-1" };
    mockSupabaseState.profileShopId = "shop-real";
    mockSupabaseState.customers = [];
    mockSupabaseState.vehicles = [];
    mockSupabaseState.inserts = [];
  });

  it("rejects unauthenticated users", async () => {
    mockSupabaseState.user = null;
    const result = await createVehicleAction(undefined, form({ unit_number: "A1" }));
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/signed in/i);
  });

  it("rejects users without a shop", async () => {
    mockSupabaseState.profileShopId = null;
    const result = await createVehicleAction(undefined, form({ unit_number: "A1" }));
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/not linked to a shop/i);
  });

  it("ignores client shop_id and inserts into the authenticated profile shop", async () => {
    const result = await createVehicleAction(undefined, form({ unit_number: "A1", vin: "1HGCM82633A004352", shop_id: "evil-shop" }));
    expect(result.ok).toBe(true);
    expect(mockSupabaseState.inserts[0]).toMatchObject({ shop_id: "shop-real", user_id: "user-1", unit_number: "A1", vin: "1HGCM82633A004352" });
    expect(mockSupabaseState.inserts[0].shop_id).not.toBe("evil-shop");
  });

  it("rejects cross-shop customer_id", async () => {
    mockSupabaseState.customers = [{ id: "customer-1", shop_id: "other-shop" }];
    const result = await createVehicleAction(undefined, form({ unit_number: "A1", customer_id: "customer-1" }));
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/does not belong/i);
  });

  it("blocks duplicate VIN in the same shop", async () => {
    mockSupabaseState.vehicles = [{ id: "vehicle-1", shop_id: "shop-real", vin: "1HGCM82633A004352" }];
    const result = await createVehicleAction(undefined, form({ vin: "1HGCM82633A004352" }));
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/VIN already exists/i);
    expect(mockSupabaseState.inserts).toHaveLength(0);
  });
});
