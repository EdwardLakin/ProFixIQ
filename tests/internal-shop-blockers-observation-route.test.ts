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

function createShopQuery(input?: {
  data?: Array<{ id: string }>;
  error?: { message: string } | null;
}) {
  const query = {
    select: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockResolvedValue({
    data: input?.data ?? [{ id: "shop_1" }, { id: "shop_2" }],
    error: input?.error ?? null,
  });
  return query;
}

function createSupabase(input?: { shopsError?: { message: string } | null }) {
  const shopQuery = createShopQuery({ error: input?.shopsError });
  return {
    from: vi.fn((table: string) => {
      if (table !== "shops") throw new Error(`Unexpected table: ${table}`);
      return shopQuery;
    }),
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
    createAdminSupabaseMock.mockReturnValue(createSupabase());

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
    createAdminSupabaseMock.mockReturnValue(createSupabase());

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
    createAdminSupabaseMock.mockReturnValue(createSupabase());
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
    createAdminSupabaseMock.mockReturnValue(createSupabase());
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
      createSupabase({ shopsError: { message: "Database unavailable" } }),
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
});
