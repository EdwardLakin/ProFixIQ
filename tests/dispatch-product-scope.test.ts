import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveShopProductAccess: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/shared/lib/product-access", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/features/shared/lib/product-access")
  >()),
  resolveShopProductAccess: mocks.resolveShopProductAccess,
}));

function access(role: string, visitFound = true) {
  const filters: Array<[string, unknown]> = [];
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: visitFound ? { id: "visit-1" } : null,
      error: null,
    }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockImplementation((column: string, value: unknown) => {
    filters.push([column, value]);
    return query;
  });
  const supabase = { from: vi.fn().mockReturnValue(query) };

  return {
    value: {
      ok: true as const,
      authUserId: "auth-user-1",
      canonicalRole: role,
      profile: { id: "profile-1", shop_id: "shop-1", role },
      supabase,
    },
    filters,
    supabase,
  };
}

describe("dispatch product scope", () => {
  beforeEach(() => vi.clearAllMocks());

  it("prefers Shop authority and falls back to Field without conflating them", async () => {
    mocks.resolveShopProductAccess.mockImplementation(
      async ({ capabilities }: { capabilities: readonly string[] }) => ({
        entitled: capabilities.includes("shop"),
        error: null,
      }),
    );
    const { resolveDispatchProductScope } =
      await import("@/features/dispatch/server/productScope");

    await expect(
      resolveDispatchProductScope(access("manager").value as never),
    ).resolves.toBe("shop");

    mocks.resolveShopProductAccess.mockImplementation(
      async ({ capabilities }: { capabilities: readonly string[] }) => ({
        entitled: capabilities.includes("field_service"),
        error: null,
      }),
    );
    await expect(
      resolveDispatchProductScope(access("manager").value as never),
    ).resolves.toBe("field");
  });

  it("filters Shop-mode visits and creation from Field dispatch", async () => {
    const { canCreateDispatchMode, filterDispatchBoardForProduct } =
      await import("@/features/dispatch/server/productScope");
    const board = {
      generatedAt: "2026-08-26T00:00:00.000Z",
      visits: [
        { id: "shop-visit", mode: "shop" },
        { id: "field-visit", mode: "mobile" },
      ],
      technicians: [],
      serviceVehicles: [],
    };

    expect(
      filterDispatchBoardForProduct(board as never, "field").visits.map(
        (visit) => visit.id,
      ),
    ).toEqual(["field-visit"]);
    expect(
      filterDispatchBoardForProduct(board as never, "shop").visits,
    ).toHaveLength(2);
    expect(canCreateDispatchMode("field", "shop")).toBe(false);
    expect(canCreateDispatchMode("field", "mobile")).toBe(true);
  });

  it("binds a Field worker to a same-shop mobile visit assigned to their canonical profile", async () => {
    const { canAccessDispatchVisit } =
      await import("@/features/dispatch/server/productScope");
    const fixture = access("mechanic");

    await expect(
      canAccessDispatchVisit({
        access: fixture.value as never,
        scope: "field",
        visitId: "visit-1",
      }),
    ).resolves.toBe(true);
    expect(fixture.filters).toEqual([
      ["id", "visit-1"],
      ["shop_id", "shop-1"],
      ["mode", "mobile"],
      ["assigned_user_id", "profile-1"],
    ]);
  });

  it("allows a Field scheduler to manage any same-shop mobile visit but not a missing visit", async () => {
    const { canAccessDispatchVisit } =
      await import("@/features/dispatch/server/productScope");
    const fixture = access("manager", false);

    await expect(
      canAccessDispatchVisit({
        access: fixture.value as never,
        scope: "field",
        visitId: "visit-1",
      }),
    ).resolves.toBe(false);
    expect(fixture.filters).toEqual([
      ["id", "visit-1"],
      ["shop_id", "shop-1"],
      ["mode", "mobile"],
    ]);
  });
});
