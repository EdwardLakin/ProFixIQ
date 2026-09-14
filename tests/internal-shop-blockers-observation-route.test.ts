import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const requireInternalApiSecretMock = vi.fn();
const createAdminSupabaseMock = vi.fn();
const syncShopBlockerObservationsMock = vi.fn();

vi.mock("@/features/shared/lib/server/api-route-guard", () => ({
  requireInternalApiSecret: requireInternalApiSecretMock,
}));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: createAdminSupabaseMock,
}));

vi.mock("@/features/operations/server/syncShopBlockerObservations", () => ({
  syncShopBlockerObservations: syncShopBlockerObservationsMock,
}));

type ShopRow = { id: string; created_at: string };
type Page = { data?: ShopRow[]; error?: { message: string } | null };

type QueryNode = {
  select: (columns: string) => QueryNode;
  order: (column: string, opts?: { ascending?: boolean }) => QueryNode;
  limit: (count: number) => QueryNode;
  gt: (column: string, value: string) => QueryNode;
  then: (
    resolve: (value: { data: ShopRow[] | undefined; error: unknown }) => unknown,
  ) => unknown;
};

function createShopsQuery(pages: Page[]): QueryNode {
  const gtCalls: Array<[string, string]> = [];

  function makePage(index: number): QueryNode {
    const page = pages[index] ?? { data: [], error: null };
    const node: QueryNode = {
      select: vi.fn(() => node),
      order: vi.fn(() => node),
      limit: vi.fn(() => node),
      gt: vi.fn((col: string, value: string) => {
        gtCalls.push([col, value]);
        return makePage(index + 1);
      }),
      then: (resolve) =>
        Promise.resolve({
          data: page.data ?? [],
          error: page.error ?? null,
        }).then(resolve),
    };
    return node;
  }

  const root = makePage(0);
  return Object.assign(root, { __gtCalls: gtCalls }) as QueryNode;
}

function createSupabase(pages: Page[]) {
  const shopsQuery = createShopsQuery(pages);
  return {
    from: vi.fn((table: string) => {
      if (table !== "shops") throw new Error(`Unexpected table: ${table}`);
      return shopsQuery;
    }),
    __shopsQuery: shopsQuery,
  };
}

describe("GET /api/internal/observability/shop-blockers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    requireInternalApiSecretMock.mockReturnValue({ ok: true });
    syncShopBlockerObservationsMock.mockResolvedValue({
      shopId: "shop_1",
      observed: 0,
      opened: 0,
      continuing: 0,
      resolved: 0,
      errors: [],
    });
  });

  it("uses the shared guard with Vercel cron bearer authorization enabled", async () => {
    createAdminSupabaseMock.mockReturnValue(
      createSupabase([{ data: [{ id: "shop_1", created_at: "t1" }] }]),
    );

    const { GET } = await import(
      "../app/api/internal/observability/shop-blockers/route"
    );
    const response = await GET(
      new Request(
        "https://example.test/api/internal/observability/shop-blockers",
      ),
    );

    expect(response.status).toBe(200);
    expect(requireInternalApiSecretMock).toHaveBeenCalledWith(
      expect.objectContaining({
        envSecretName: "INTERNAL_CRON_SECRET",
        headerName: "x-internal-cron-secret",
        bearerEnvSecretName: "CRON_SECRET",
      }),
    );
  });

  it("rejects requests that fail the internal secret guard", async () => {
    requireInternalApiSecretMock.mockReturnValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    createAdminSupabaseMock.mockReturnValue(createSupabase([{ data: [] }]));

    const { GET } = await import(
      "../app/api/internal/observability/shop-blockers/route"
    );
    const response = await GET(
      new Request(
        "https://example.test/api/internal/observability/shop-blockers",
      ),
    );

    expect(response.status).toBe(401);
    expect(createAdminSupabaseMock).not.toHaveBeenCalled();
  });

  it("syncs every shop and aggregates the summary", async () => {
    createAdminSupabaseMock.mockReturnValue(
      createSupabase([
        {
          data: [
            { id: "shop_1", created_at: "t1" },
            { id: "shop_2", created_at: "t2" },
          ],
        },
      ]),
    );
    syncShopBlockerObservationsMock
      .mockResolvedValueOnce({
        shopId: "shop_1",
        observed: 3,
        opened: 1,
        continuing: 2,
        resolved: 0,
        errors: [],
      })
      .mockResolvedValueOnce({
        shopId: "shop_2",
        observed: 1,
        opened: 0,
        continuing: 0,
        resolved: 1,
        errors: [],
      });

    const { GET } = await import(
      "../app/api/internal/observability/shop-blockers/route"
    );
    const response = await GET(
      new Request(
        "https://example.test/api/internal/observability/shop-blockers",
      ),
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      checkedShops: 2,
      observed: 4,
      opened: 1,
      continuing: 2,
      resolved: 1,
      warnings: [],
    });
    expect(syncShopBlockerObservationsMock).toHaveBeenCalledTimes(2);
    expect(syncShopBlockerObservationsMock).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: "shop_1" }),
    );
    expect(syncShopBlockerObservationsMock).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: "shop_2" }),
    );
  });

  it("reports a per-shop failure as a warning instead of failing the whole run", async () => {
    createAdminSupabaseMock.mockReturnValue(
      createSupabase([
        {
          data: [
            { id: "shop_1", created_at: "t1" },
            { id: "shop_2", created_at: "t2" },
          ],
        },
      ]),
    );
    syncShopBlockerObservationsMock
      .mockResolvedValueOnce({
        shopId: "shop_1",
        observed: 0,
        opened: 0,
        continuing: 0,
        resolved: 0,
        errors: [],
      })
      .mockRejectedValueOnce(new Error("boom"));

    const { GET } = await import(
      "../app/api/internal/observability/shop-blockers/route"
    );
    const response = await GET(
      new Request(
        "https://example.test/api/internal/observability/shop-blockers",
      ),
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.warnings).toEqual([{ shopId: "shop_2", error: "boom" }]);
  });

  it("returns 500 when the shop list cannot be loaded", async () => {
    createAdminSupabaseMock.mockReturnValue(
      createSupabase([{ error: { message: "Database unavailable" } }]),
    );

    const { GET } = await import(
      "../app/api/internal/observability/shop-blockers/route"
    );
    const response = await GET(
      new Request(
        "https://example.test/api/internal/observability/shop-blockers",
      ),
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(500);
    expect(body.error).toBe("Database unavailable");
    expect(syncShopBlockerObservationsMock).not.toHaveBeenCalled();
  });

  it("pages through the full shop table instead of a fixed 500-shop cap", async () => {
    const fullPage: ShopRow[] = Array.from({ length: 500 }, (_, index) => ({
      id: `shop_${index}`,
      created_at: `2026-01-01T00:${String(index % 60).padStart(2, "0")}:00.000Z`,
    }));
    const tailPage: ShopRow[] = [{ id: "shop_500", created_at: "2026-02-01T00:00:00.000Z" }];

    const supabase = createSupabase([{ data: fullPage }, { data: tailPage }]);
    createAdminSupabaseMock.mockReturnValue(supabase);

    const { GET } = await import(
      "../app/api/internal/observability/shop-blockers/route"
    );
    const response = await GET(
      new Request(
        "https://example.test/api/internal/observability/shop-blockers",
      ),
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.checkedShops).toBe(501);
    expect(syncShopBlockerObservationsMock).toHaveBeenCalledTimes(501);
    expect(syncShopBlockerObservationsMock).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: "shop_500" }),
    );
  });
});
