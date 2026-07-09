import { beforeEach, describe, expect, it, vi } from "vitest";

let mockSupabase: ReturnType<typeof createSupabaseMock>;

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: vi.fn(async () => ({
    ok: true,
    supabase: mockSupabase,
    profile: { shop_id: "shop-123" },
  })),
}));

type Customer = {
  id: string;
  shop_id?: string;
  external_id?: string | null;
  email?: string | null;
  phone?: string | null;
  phone_number?: string | null;
  name?: string | null;
  business_name?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  customer_since?: string | null;
  updated_at?: string | null;
};

function createSupabaseMock(existingCustomers: Customer[] = []) {
  const inserted: Customer[] = [];
  const updates: Array<{
    patch: Partial<Customer>;
    filters: Record<string, unknown>;
  }> = [];
  const ranges: Array<[number, number]> = [];

  function from(table: string) {
    expect(table).toBe("customers");
    const filters: Record<string, unknown> = {};
    let patch: Partial<Customer> | null = null;

    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn((key: string, value: unknown) => {
        filters[key] = value;
        return builder;
      }),
      order: vi.fn(() => builder),
      range: vi.fn(async (fromIndex: number, toIndex: number) => {
        ranges.push([fromIndex, toIndex]);
        return {
          data: existingCustomers.slice(fromIndex, toIndex + 1),
          error: null,
        };
      }),
      insert: vi.fn(async (payload: Customer) => {
        inserted.push({ ...payload, id: `inserted-${inserted.length + 1}` });
        return { error: null };
      }),
      update: vi.fn((nextPatch: Partial<Customer>) => {
        patch = nextPatch;
        return builder;
      }),
      then: (resolve: (value: { error: null }) => void) => {
        if (patch) updates.push({ patch, filters: { ...filters } });
        resolve({ error: null });
      },
    };

    return builder;
  }

  return { from: vi.fn(from), inserted, updates, ranges };
}

async function postRows(rows: Array<Record<string, unknown>>) {
  vi.resetModules();
  const { POST } = await import("../app/api/customers/import/route");
  const response = await POST(
    new Request("http://localhost/api/customers/import", {
      method: "POST",
      body: JSON.stringify({ rows }),
    }),
  );
  return response.json();
}

describe("customer CSV import identity matching", () => {
  beforeEach(() => {
    mockSupabase = createSupabaseMock();
  });

  it("creates separate customers when unique customer_id rows share fallback identities", async () => {
    const body = await postRows([
      {
        customer_id: "CUST-100386",
        company_name: "Fleet Co",
        email: "ops@example.com",
        phone: "555-111-2222",
      },
      {
        customer_id: "CUST-101177",
        company_name: "Fleet Co",
        email: "ops@example.com",
        phone: "555-111-2222",
      },
      {
        customer_id: "CUST-101310",
        company_name: "Fleet Co",
        email: "ops@example.com",
        phone: "555-111-2222",
      },
    ]);

    expect(body.counts).toMatchObject({
      created: 3,
      updated: 0,
      skipped: 0,
      failed: 0,
      duplicates: 0,
    });
    expect(
      mockSupabase.inserted.map((customer) => customer.external_id),
    ).toEqual(["CUST-100386", "CUST-101177", "CUST-101310"]);
  });

  it("updates an existing customer only when the external_id matches", async () => {
    mockSupabase = createSupabaseMock([
      {
        id: "existing-1",
        external_id: "CUST-100386",
        email: "other@example.com",
        phone: "5559990000",
      },
      {
        id: "existing-2",
        external_id: "CUST-OTHER",
        email: "ops@example.com",
        phone: "5551112222",
      },
    ]);

    const body = await postRows([
      {
        customer_id: "CUST-100386",
        company_name: "Fleet Co",
        email: "ops@example.com",
        phone: "555-111-2222",
        customer_since: "2024-01-02",
      },
    ]);

    expect(body.counts).toMatchObject({
      created: 0,
      updated: 1,
      skipped: 0,
      failed: 0,
      duplicates: 0,
    });
    expect(mockSupabase.inserted).toHaveLength(0);
    expect(mockSupabase.updates).toEqual([
      {
        patch: { customer_since: "2024-01-02" },
        filters: { id: "existing-1", shop_id: "shop-123" },
      },
    ]);
  });

  it("still uses fallback duplicate protection when customer_id is missing", async () => {
    const body = await postRows([
      {
        company_name: "No Id Co",
        email: "same@example.com",
        phone: "555-111-2222",
      },
      {
        company_name: "No Id Co",
        email: "same@example.com",
        phone: "555-111-2222",
      },
    ]);

    expect(body.counts).toMatchObject({
      created: 1,
      updated: 0,
      skipped: 1,
      failed: 0,
      duplicates: 1,
    });
    expect(mockSupabase.inserted).toHaveLength(1);
  });

  it("paginates existing customer identity loading instead of relying on one uncapped select", async () => {
    const customers = Array.from({ length: 1001 }, (_, index) => ({
      id: `customer-${index}`,
      external_id: `CUST-${index}`,
    }));
    mockSupabase = createSupabaseMock(customers);

    await postRows([{ customer_id: "CUST-new", company_name: "New Co" }]);

    expect(mockSupabase.ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });
});
