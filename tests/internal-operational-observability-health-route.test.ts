import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const requireInternalApiSecretMock = vi.fn();
const createAdminSupabaseMock = vi.fn();
const syncOperationalObservabilityAlertsMock = vi.fn();

vi.mock("@/features/shared/lib/server/api-route-guard", () => ({
  requireInternalApiSecret: requireInternalApiSecretMock,
}));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: createAdminSupabaseMock,
}));

vi.mock(
  "@/features/operations/server/syncOperationalObservabilityAlerts",
  () => ({
    syncOperationalObservabilityAlerts:
      syncOperationalObservabilityAlertsMock,
  }),
);

function createShopQuery(input?: {
  data?: Array<{ id: string }>;
  error?: { message: string } | null;
}) {
  const query = {
    select: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn().mockResolvedValue({
      data: input?.data ?? [{ id: "shop_1" }],
      error: input?.error ?? null,
    }),
  };
  return query;
}

function createSupabase(input: {
  projectionError: { code?: string; message?: string } | null;
  shopsError?: { message: string } | null;
}) {
  const shopQuery = createShopQuery({ error: input.shopsError });
  return {
    rpc: vi.fn().mockResolvedValue({
      data: null,
      error: input.projectionError,
    }),
    from: vi.fn((table: string) => {
      if (table !== "shops") throw new Error(`Unexpected table: ${table}`);
      return shopQuery;
    }),
  };
}

describe("GET /api/internal/observability/health", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    requireInternalApiSecretMock.mockReturnValue({ ok: true });
    syncOperationalObservabilityAlertsMock.mockResolvedValue({
      shopId: "shop_1",
      installed: false,
      pipelineStatus: "not_installed",
      pipelineStalled: false,
      activeFailures: 0,
      eventVolumeDropped: false,
      aiExpirationNeedsReview: false,
    });
  });

  it("rejects requests that fail the internal secret guard", async () => {
    requireInternalApiSecretMock.mockReturnValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    createAdminSupabaseMock.mockReturnValue(
      createSupabase({ projectionError: null }),
    );

    const { GET } = await import(
      "../app/api/internal/observability/health/route"
    );
    const response = await GET(
      new Request("https://example.test/api/internal/observability/health"),
    );

    expect(response.status).toBe(401);
    expect(createAdminSupabaseMock).not.toHaveBeenCalled();
  });

  it("uses degraded mode when the projection is not installed", async () => {
    const supabase = createSupabase({
      projectionError: {
        code: "PGRST202",
        message: "Function is missing from the schema cache",
      },
    });
    createAdminSupabaseMock.mockReturnValue(supabase);

    const { GET } = await import(
      "../app/api/internal/observability/health/route"
    );
    const response = await GET(
      new Request("https://example.test/api/internal/observability/health"),
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.degraded).toBe(true);
    expect(body.projectionUsed).toBe(false);
    expect(body.projectionWarning).toEqual(
      expect.objectContaining({
        code: "projection_unavailable",
        databaseCode: "PGRST202",
      }),
    );
    expect(syncOperationalObservabilityAlertsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: "shop_1",
        operationalHealth: undefined,
      }),
    );
  });

  it("also degrades on an unexpected projection error", async () => {
    createAdminSupabaseMock.mockReturnValue(
      createSupabase({
        projectionError: {
          code: "42501",
          message: "Projection permission error",
        },
      }),
    );

    const { GET } = await import(
      "../app/api/internal/observability/health/route"
    );
    const response = await GET(
      new Request("https://example.test/api/internal/observability/health"),
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.degraded).toBe(true);
    expect(body.projectionWarning).toEqual(
      expect.objectContaining({
        code: "projection_failed",
        databaseCode: "42501",
      }),
    );
  });

  it("still returns 500 when the database fallback cannot list shops", async () => {
    createAdminSupabaseMock.mockReturnValue(
      createSupabase({
        projectionError: { code: "08006", message: "Connection failed" },
        shopsError: { message: "Database unavailable" },
      }),
    );

    const { GET } = await import(
      "../app/api/internal/observability/health/route"
    );
    const response = await GET(
      new Request("https://example.test/api/internal/observability/health"),
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(500);
    expect(body.error).toBe("Database unavailable");
    expect(syncOperationalObservabilityAlertsMock).not.toHaveBeenCalled();
  });
});
