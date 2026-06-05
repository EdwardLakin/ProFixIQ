import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireShopScopedApiAccess: vi.fn(),
  createAdminSupabase: vi.fn(),
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireShopScopedApiAccess,
}));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: mocks.createAdminSupabase,
}));

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  username: string | null;
  phone: string | null;
  role: string | null;
  created_at: string | null;
  shop_id: string;
};

function buildUsers(count: number, shopId = "shop-1"): ProfileRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `user-${String(index + 1).padStart(2, "0")}`,
    full_name: `Staff ${String(index + 1).padStart(2, "0")}`,
    email: `staff${index + 1}@example.com`,
    username: `staff${index + 1}`,
    phone: `555-010${index % 10}`,
    role: index % 2 === 0 ? "mechanic" : "advisor",
    created_at: null,
    shop_id: shopId,
  }));
}

function jsonRequest(path: string): Request {
  return new Request(`http://localhost${path}`);
}

function setupUsersRoute(rows: ProfileRow[]) {
  const calls: { table?: string; select?: string; eq?: [string, string | null]; order: unknown[]; limit?: number; or?: string } = {
    order: [],
  };

  const query: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    or: ReturnType<typeof vi.fn>;
    then: (resolve: (value: { data: ProfileRow[]; error: null }) => void) => void;
  } = {
    select: vi.fn((columns: string) => {
      calls.select = columns;
      return query;
    }),
    eq: vi.fn((column: string, value: string | null) => {
      calls.eq = [column, value];
      return query;
    }),
    order: vi.fn((column: string, options: unknown) => {
      calls.order.push([column, options]);
      return query;
    }),
    limit: vi.fn((limit: number) => {
      calls.limit = limit;
      return query;
    }),
    or: vi.fn((filter: string) => {
      calls.or = filter;
      return query;
    }),
    then: (resolve: (value: { data: ProfileRow[]; error: null }) => void) => resolve({ data: rows.slice(0, calls.limit ?? rows.length), error: null }),
  };

  const adminClient = {
    from: vi.fn((table: string) => {
      calls.table = table;
      return query;
    }),
  };

  mocks.requireShopScopedApiAccess.mockResolvedValue({
    ok: true,
    profile: { id: "actor-1", shop_id: "shop-1", role: "owner" },
    canonicalRole: "owner",
  });
  mocks.createAdminSupabase.mockReturnValue(adminClient);

  return { calls, query, adminClient };
}

describe("GET /api/admin/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the first 20 shop-scoped staff alphabetically by default", async () => {
    const { GET } = await import("../app/api/admin/users/route");
    const { calls } = setupUsersRoute(buildUsers(25));

    const response = await GET(jsonRequest("/api/admin/users"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.users).toHaveLength(20);
    expect(calls.select).toContain("username");
    expect(calls.eq).toEqual(["shop_id", "shop-1"]);
    expect(calls.order).toEqual([
      ["full_name", { ascending: true, nullsFirst: false }],
      ["username", { ascending: true, nullsFirst: false }],
    ]);
    expect(calls.limit).toBe(20);
    expect(calls.or).toBeUndefined();
  });

  it.each([
    ["name", "Sam Tech", "full_name.ilike.%Sam Tech%"],
    ["email", "sam@example.com", "email.ilike.%sam@example.com%"],
    ["username", "samtech", "username.ilike.%samtech%"],
    ["phone", "555-1212", "phone.ilike.%555-1212%"],
    ["role", "mechanic", "role.ilike.%mechanic%"],
  ])("searches by %s and caps results to 20", async (_label, term, expectedFilter) => {
    const { GET } = await import("../app/api/admin/users/route");
    const { calls } = setupUsersRoute(buildUsers(30));

    const response = await GET(jsonRequest(`/api/admin/users?q=${encodeURIComponent(term)}`));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.users).toHaveLength(20);
    expect(calls.or).toContain(expectedFilter);
    expect(calls.limit).toBe(20);
    expect(calls.eq).toEqual(["shop_id", "shop-1"]);
  });
});
