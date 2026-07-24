import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireShopScopedApiAccess: vi.fn(),
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireShopScopedApiAccess,
}));

const vendorId = "11111111-1111-4111-8111-111111111111";

function createSupabase(existing: Array<{ id: string; name: string }> = []) {
  const inserted: Array<Record<string, unknown>> = [];
  const updated: Array<Record<string, unknown>> = [];
  const filters: Array<[string, unknown]> = [];

  const supplierTable = {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        limit: vi.fn(async () => ({ data: existing, error: null })),
      })),
    })),
    insert: vi.fn((payload: Record<string, unknown>) => {
      inserted.push(payload);
      return {
        select: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: { id: vendorId, ...payload },
            error: null,
          })),
        })),
      };
    }),
    update: vi.fn((payload: Record<string, unknown>) => {
      updated.push(payload);
      const chain: {
        eq: (field: string, value: unknown) => typeof chain;
        select: () => {
          maybeSingle: () => Promise<{
            data: Record<string, unknown>;
            error: null;
          }>;
        };
      } = {
        eq(field: string, value: unknown) {
          filters.push([field, value]);
          return chain;
        },
        select: () => ({
          maybeSingle: async () => ({
            data: { id: vendorId, shop_id: "shop-1", ...payload },
            error: null,
          }),
        }),
      };
      return chain;
    }),
  };

  return {
    from: vi.fn((table: string) => {
      if (table !== "suppliers") throw new Error(`Unexpected table ${table}`);
      return supplierTable;
    }),
    supplierTable,
    inserted,
    updated,
    filters,
  };
}

function authorize(supabase: ReturnType<typeof createSupabase>) {
  mocks.requireShopScopedApiAccess.mockResolvedValue({
    ok: true,
    profile: { id: "actor-1", shop_id: "shop-1" },
    supabase,
  });
}

describe("parts vendor management route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a vendor only in the authorized shop scope", async () => {
    const supabase = createSupabase();
    authorize(supabase);
    const { POST } = await import("../../app/api/parts/vendors/route");
    const response = await POST(
      new Request("http://localhost/api/parts/vendors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "North Star Parts",
          accountNo: "A-100",
          email: "parts@northstar.example",
          phone: "555-0100",
          notes: "Main supplier",
          isActive: true,
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.requireShopScopedApiAccess).toHaveBeenCalledWith({
      requiredCapability: "canManageParts",
    });
    expect(supabase.inserted).toEqual([
      expect.objectContaining({
        shop_id: "shop-1",
        created_by: "actor-1",
        name: "North Star Parts",
        account_no: "A-100",
      }),
    ]);
  });

  it("rejects normalized duplicate names before inserting", async () => {
    const supabase = createSupabase([
      { id: vendorId, name: "North-Star Parts" },
    ]);
    authorize(supabase);
    const { POST } = await import("../../app/api/parts/vendors/route");
    const response = await POST(
      new Request("http://localhost/api/parts/vendors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "north star parts" }),
      }),
    );

    expect(response.status).toBe(409);
    expect(supabase.supplierTable.insert).not.toHaveBeenCalled();
  });

  it("scopes an idempotent update by vendor id and authorized shop id", async () => {
    const supabase = createSupabase();
    authorize(supabase);
    const { PATCH } = await import("../../app/api/parts/vendors/route");
    const response = await PATCH(
      new Request("http://localhost/api/parts/vendors", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: vendorId,
          name: "North Star Parts",
          accountNo: "",
          email: "",
          phone: "",
          notes: "",
          isActive: false,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(supabase.updated).toEqual([
      expect.objectContaining({
        name: "North Star Parts",
        account_no: null,
        is_active: false,
      }),
    ]);
    expect(supabase.filters).toEqual([
      ["id", vendorId],
      ["shop_id", "shop-1"],
    ]);
  });
});
