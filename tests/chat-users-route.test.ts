import { beforeEach, describe, expect, it, vi } from "vitest";

type ProfileRow = {
  id: string | null;
  user_id: string | null;
  full_name: string | null;
  role: string | null;
  email: string | null;
  shop_id: string | null;
  avatar_url?: string | null;
};

type CustomerRow = {
  id: string;
  user_id: string | null;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  shop_id: string | null;
};

type QueryResult<T> = { data: T; error: { message: string } | null };

const mockState = {
  authUserId: "actor-user-id",
  me: {
    id: "profile-actor",
    user_id: "actor-user-id",
    shop_id: "shop-a",
    role: "advisor",
  },
  profiles: [] as ProfileRow[],
  customers: [] as CustomerRow[],
  lastProfilesEq: null as { column: string; value: string } | null,
  lastCustomersEq: null as { column: string; value: string } | null,
};

function asAwaitable<T extends object>(
  target: T,
  resolver: () => Promise<QueryResult<unknown>>,
): T {
  return Object.assign(target, {
    then: (
      onFulfilled?: (value: QueryResult<unknown>) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => resolver().then(onFulfilled, onRejected),
  });
}

function createUserClient() {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: mockState.authUserId } },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      if (table !== "profiles") throw new Error(`Unexpected table: ${table}`);
      return {
        select: vi.fn(() => ({
          or: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: mockState.me,
              error: null,
            })),
          })),
        })),
      };
    }),
  };
}

function createAdminClient() {
  return {
    from: vi.fn((table: string) => {
      if (table === "customers") {
        let eqFilter: { column: string; value: string } | null = null;
        let searchQuery = "";
        const baseQuery: Record<string, unknown> = {};
        const query = asAwaitable(baseQuery, async () => {
          const scoped =
            eqFilter?.column === "shop_id"
              ? mockState.customers.filter((row) => row.shop_id === eqFilter?.value)
              : mockState.customers;
          const searchMatch = /name\.ilike\.%(.*?)%,first_name\.ilike/.exec(searchQuery);
          const text = (searchMatch?.[1] ?? "").trim().toLowerCase();
          return {
            data: text
              ? scoped.filter((row) =>
                  [row.name, row.first_name, row.last_name, row.email, row.phone]
                    .filter(Boolean)
                    .some((value) => value?.toLowerCase().includes(text)),
                )
              : scoped,
            error: null,
          };
        });
        query.select = vi.fn(() => query);
        query.eq = vi.fn((column: string, value: string) => {
          eqFilter = { column, value };
          mockState.lastCustomersEq = eqFilter;
          return query;
        });
        query.order = vi.fn(() => query);
        query.limit = vi.fn(() => query);
        query.or = vi.fn((pattern: string) => {
          searchQuery = pattern;
          return query;
        });
        return query;
      }

      if (table !== "profiles") throw new Error(`Unexpected table: ${table}`);

      let eqFilter: { column: string; value: string } | null = null;
      let searchQuery = "";

      const baseQuery: Record<string, unknown> = {};
      const query = asAwaitable(baseQuery, async () => {
          const filteredByShop =
            eqFilter && eqFilter.column === "shop_id"
              ? mockState.profiles.filter((p) => p.shop_id === eqFilter?.value)
              : mockState.profiles;

          const searchMatch = /full_name\.ilike\.%(.*?)%,email\.ilike/.exec(
            searchQuery,
          );
          const text = (searchMatch?.[1] ?? "").trim().toLowerCase();

          const filtered =
            text.length > 0
              ? filteredByShop.filter((row) =>
                  [row.full_name, row.email, row.role]
                    .filter(Boolean)
                    .some((value) => value?.toLowerCase().includes(text)),
                )
              : filteredByShop;

          return { data: filtered, error: null };
        });

      query.select = vi.fn(() => query);
      query.order = vi.fn(() => query);
      query.limit = vi.fn(() => query);
      query.eq = vi.fn((column: string, value: string) => {
        eqFilter = { column, value };
        mockState.lastProfilesEq = eqFilter;
        return query;
      });
      query.or = vi.fn((pattern: string) => {
        searchQuery = pattern;
        return query;
      });

      return query;
    }),
  };
}

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createServerSupabaseRoute: vi.fn(() => createUserClient()),
  createAdminSupabase: vi.fn(() => createAdminClient()),
}));
vi.mock("/workspace/ProFixIQ/features/shared/lib/supabase/server.ts", () => ({
  createServerSupabaseRoute: vi.fn(() => createUserClient()),
  createAdminSupabase: vi.fn(() => createAdminClient()),
}));
vi.mock("server-only", () => ({}));

describe("GET /api/chat/users", () => {
  beforeEach(() => {
    mockState.authUserId = "actor-user-id";
    mockState.me = {
      id: "profile-actor",
      user_id: "actor-user-id",
      shop_id: "shop-a",
      role: "advisor",
    };
    mockState.lastProfilesEq = null;
    mockState.lastCustomersEq = null;
    mockState.profiles = [
      {
        id: "profile-actor",
        user_id: "actor-user-id",
        full_name: "Alice Advisor",
        role: "advisor",
        email: "alice@shop-a.com",
        shop_id: "shop-a",
      },
      {
        id: "profile-a-tech",
        user_id: "tech-a-id",
        full_name: "Tom Tech",
        role: "tech",
        email: "tom@shop-a.com",
        shop_id: "shop-a",
      },
      {
        id: "profile-b-owner",
        user_id: "owner-b-id",
        full_name: "Bob Owner",
        role: "owner",
        email: "bob@shop-b.com",
        shop_id: "shop-b",
      },
    ];
    mockState.customers = [
      {
        id: "customer-a",
        user_id: "customer-a-user",
        name: "Casey Customer",
        first_name: "Casey",
        last_name: "Customer",
        email: "casey@example.com",
        phone: "555-0100",
        shop_id: "shop-a",
      },
      {
        id: "customer-b",
        user_id: "customer-b-user",
        name: "Cross Shop Customer",
        first_name: "Cross",
        last_name: "Shop",
        email: "cross@example.com",
        phone: "555-0200",
        shop_id: "shop-b",
      },
    ];
  });

  it("never returns users from another shop", async () => {
    const { GET } = await import("../app/api/chat/users/route");
    const response = await GET(new Request("http://localhost/api/chat/users"));
    const body = (await response.json()) as { users: Array<{ email: string }> };

    expect(response.status).toBe(200);
    expect(body.users.map((u) => u.email)).toEqual([
      "alice@shop-a.com",
      "tom@shop-a.com",
    ]);
    expect(body.users.some((u) => u.email === "bob@shop-b.com")).toBe(false);
  });

  it("keeps same-shop lookup behavior for search queries", async () => {
    const { GET } = await import("../app/api/chat/users/route");
    const response = await GET(new Request("http://localhost/api/chat/users?q=Tom"));
    const body = (await response.json()) as { users: Array<{ full_name: string }> };

    expect(response.status).toBe(200);
    expect(body.users.map((u) => u.full_name)).toEqual(["Tom Tech"]);
  });

  it("does not expand beyond actor shop when search returns a small set", async () => {
    const { GET } = await import("../app/api/chat/users/route");
    const response = await GET(
      new Request("http://localhost/api/chat/users?q=Alice"),
    );
    const body = (await response.json()) as { users: Array<{ email: string }> };

    expect(response.status).toBe(200);
    expect(body.users).toHaveLength(1);
    expect(body.users[0]?.email).toBe("alice@shop-a.com");
    expect(body.users.some((u) => u.email === "bob@shop-b.com")).toBe(false);
  });

  it("always applies shop_id scoping in the admin query path", async () => {
    const { GET } = await import("../app/api/chat/users/route");
    const response = await GET(new Request("http://localhost/api/chat/users"));

    expect(response.status).toBe(200);
    expect(mockState.lastProfilesEq).toEqual({
      column: "shop_id",
      value: "shop-a",
    });
    expect(mockState.lastCustomersEq).toEqual({
      column: "shop_id",
      value: "shop-a",
    });
  });

  it("returns only same-shop customers and exposes portal messaging readiness", async () => {
    const { GET } = await import("../app/api/chat/users/route");
    const response = await GET(new Request("http://localhost/api/chat/users"));
    const body = (await response.json()) as {
      customers: Array<{ id: string; can_message: boolean }>;
    };

    expect(response.status).toBe(200);
    expect(body.customers).toEqual([
      expect.objectContaining({ id: "customer-a", can_message: true }),
    ]);
  });

  it("does not expose the customer directory to non-customer-facing roles", async () => {
    mockState.me.role = "tech";

    const { GET } = await import("../app/api/chat/users/route");
    const response = await GET(new Request("http://localhost/api/chat/users"));
    const body = (await response.json()) as { customers: unknown[] };

    expect(response.status).toBe(200);
    expect(body.customers).toEqual([]);
    expect(mockState.lastCustomersEq).toBeNull();
  });
});
