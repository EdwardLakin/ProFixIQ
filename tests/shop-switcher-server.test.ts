import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: { id: "actor-1" },
  createServerSupabaseRoute: vi.fn(),
  createAdminSupabase: vi.fn(),
}));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createServerSupabaseRoute: mocks.createServerSupabaseRoute,
  createAdminSupabase: mocks.createAdminSupabase,
}));

type ProfileRow = {
  id: string;
  role: string | null;
  shop_id: string | null;
  business_name: string | null;
  shop_name: string | null;
};

type ShopRow = {
  id: string;
  business_name: string | null;
  email: string | null;
  city: string | null;
};

type MemberRow = { shop_id: string; role: string };

function jsonRequest(path: string, body?: unknown) {
  return new Request(`http://localhost${path}`, {
    method: body ? "POST" : "GET",
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "Content-Type": "application/json" } : undefined,
  });
}

function buildAdminClient(options: {
  profile: ProfileRow;
  shops: ShopRow[];
  memberships: MemberRow[];
  membershipError?: { code: string; message: string } | null;
}) {
  const updates: Array<{ table: string; patch: Record<string, unknown>; eq?: [string, string] }> = [];
  const inserts: Array<{ table: string; row: unknown }> = [];

  const shopsById = new Map(options.shops.map((shop) => [shop.id, shop]));
  let profile = { ...options.profile };

  function profileReadQuery() {
    return {
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data: profile, error: null })),
      })),
    };
  }

  function profileUpdateQuery(patch: Record<string, unknown>) {
    const updateCall = { table: "profiles", patch, eq: undefined as [string, string] | undefined };
    updates.push(updateCall);
    return {
      eq: vi.fn((column: string, value: string) => {
        updateCall.eq = [column, value];
        if (column === "id" && value === profile.id) {
          profile = { ...profile, ...patch } as ProfileRow;
        }
        return {
          select: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: profile, error: null })),
          })),
        };
      }),
    };
  }

  const admin = {
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn(() => profileReadQuery()),
          update: vi.fn((patch: Record<string, unknown>) => profileUpdateQuery(patch)),
        };
      }

      if (table === "shops") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((_column: string, id: string) => ({
              maybeSingle: vi.fn(async () => ({ data: shopsById.get(id) ?? null, error: null })),
            })),
            in: vi.fn(async (_column: string, ids: string[]) => ({
              data: ids.map((id) => shopsById.get(id)).filter(Boolean),
              error: null,
            })),
          })),
        };
      }

      if (table === "shop_members") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(async () => ({ data: options.memberships, error: options.membershipError ?? null })),
            })),
          })),
        };
      }

      if (table === "audit_logs") {
        return {
          insert: vi.fn(async (row: unknown) => {
            inserts.push({ table, row });
            return { data: null, error: null };
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return { admin, updates, inserts, getProfile: () => profile };
}

function setupAuth() {
  mocks.createServerSupabaseRoute.mockReturnValue({
    auth: { getUser: vi.fn(async () => ({ data: { user: mocks.currentUser }, error: null })) },
  });
}

describe("shop switcher server authorization", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    setupAuth();
  });

  it("returns only the current shop for regular staff", async () => {
    const { admin } = buildAdminClient({
      profile: { id: "actor-1", role: "advisor", shop_id: "shop-demo", business_name: null, shop_name: null },
      shops: [{ id: "shop-demo", business_name: "Prairie Fleet & Diesel Demo", email: null, city: null }],
      memberships: [{ shop_id: "shop-pro", role: "owner" }],
    });
    mocks.createAdminSupabase.mockReturnValue(admin);

    const { GET } = await import("../app/api/shops/available/route");
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.currentShop.name).toBe("Prairie Fleet & Diesel Demo");
    expect(payload.canSwitch).toBe(false);
    expect(payload.shops).toEqual([
      expect.objectContaining({ id: "shop-demo", current: true }),
    ]);
  });

  it("allows owner/admin actors to switch only among explicit shop memberships", async () => {
    const { admin, updates, inserts, getProfile } = buildAdminClient({
      profile: { id: "actor-1", role: "owner", shop_id: "shop-demo", business_name: null, shop_name: null },
      shops: [
        { id: "shop-demo", business_name: "Prairie Fleet & Diesel Demo", email: null, city: null },
        { id: "shop-pro", business_name: "PRO FIX", email: null, city: null },
      ],
      memberships: [
        { shop_id: "shop-demo", role: "owner" },
        { shop_id: "shop-pro", role: "admin" },
      ],
    });
    mocks.createAdminSupabase.mockReturnValue(admin);

    const { POST } = await import("../app/api/shops/switch/route");
    const response = await POST(jsonRequest("/api/shops/switch", { shop_id: "shop-pro" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.currentShop).toEqual(expect.objectContaining({ id: "shop-pro", name: "PRO FIX" }));
    expect(updates).toHaveLength(1);
    expect(updates[0].eq).toEqual(["id", "actor-1"]);
    expect(updates[0].patch.shop_id).toBe("shop-pro");
    expect(getProfile().shop_id).toBe("shop-pro");
    expect(inserts).toHaveLength(1);
  });

  it("rejects unauthorized client-provided shop_id and does not update profiles", async () => {
    const { admin, updates } = buildAdminClient({
      profile: { id: "actor-1", role: "admin", shop_id: "shop-demo", business_name: null, shop_name: null },
      shops: [{ id: "shop-demo", business_name: "Prairie Fleet & Diesel Demo", email: null, city: null }],
      memberships: [{ shop_id: "shop-demo", role: "admin" }],
    });
    mocks.createAdminSupabase.mockReturnValue(admin);

    const { POST } = await import("../app/api/shops/switch/route");
    const response = await POST(jsonRequest("/api/shops/switch", { shop_id: "shop-other" }));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toMatch(/not authorized/i);
    expect(updates).toHaveLength(0);
  });

  it("rejects regular staff switch attempts even if the client posts a shop_id", async () => {
    const { admin, updates } = buildAdminClient({
      profile: { id: "actor-1", role: "advisor", shop_id: "shop-demo", business_name: null, shop_name: null },
      shops: [{ id: "shop-demo", business_name: "Prairie Fleet & Diesel Demo", email: null, city: null }],
      memberships: [{ shop_id: "shop-pro", role: "owner" }],
    });
    mocks.createAdminSupabase.mockReturnValue(admin);

    const { POST } = await import("../app/api/shops/switch/route");
    const response = await POST(jsonRequest("/api/shops/switch", { shop_id: "shop-pro" }));

    expect(response.status).toBe(403);
    expect(updates).toHaveLength(0);
  });

  it("falls back to current shop only when shop_members is unavailable", async () => {
    const { admin } = buildAdminClient({
      profile: { id: "actor-1", role: "owner", shop_id: "shop-demo", business_name: null, shop_name: null },
      shops: [{ id: "shop-demo", business_name: "Prairie Fleet & Diesel Demo", email: null, city: null }],
      memberships: [{ shop_id: "shop-pro", role: "owner" }],
      membershipError: { code: "42P01", message: "relation does not exist" },
    });
    mocks.createAdminSupabase.mockReturnValue(admin);

    const { GET } = await import("../app/api/shops/available/route");
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.canSwitch).toBe(false);
    expect(payload.shops).toHaveLength(1);
    expect(payload.shops[0]).toEqual(expect.objectContaining({ id: "shop-demo" }));
  });
});
