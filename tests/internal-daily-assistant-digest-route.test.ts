import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const requireInternalApiSecretMock = vi.fn();
const createAdminSupabaseMock = vi.fn();
const deliverDailyAssistantDigestMock = vi.fn();
const fetchAllShopIdsMock = vi.fn();

vi.mock("@/features/shared/lib/server/api-route-guard", () => ({
  requireInternalApiSecret: requireInternalApiSecretMock,
}));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: createAdminSupabaseMock,
}));

vi.mock("@/features/shared/lib/server/fetchAllShopIds", () => ({
  fetchAllShopIds: fetchAllShopIdsMock,
}));

vi.mock("@/features/operations/server/deliverDailyAssistantDigest", () => ({
  deliverDailyAssistantDigest: deliverDailyAssistantDigestMock,
}));

describe("GET /api/internal/daily-assistant-digest", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    requireInternalApiSecretMock.mockReturnValue({ ok: true });
    createAdminSupabaseMock.mockReturnValue({});
    deliverDailyAssistantDigestMock.mockResolvedValue({
      shopId: "shop_1",
      inMorningWindow: false,
      eligibleStaff: 0,
      delivered: 0,
      alreadyDelivered: 0,
      errors: [],
    });
  });

  it("uses the shared guard with Vercel cron bearer authorization enabled", async () => {
    fetchAllShopIdsMock.mockResolvedValue(["shop_1"]);

    const { GET } = await import("../app/api/internal/daily-assistant-digest/route");
    const response = await GET(
      new Request("https://example.test/api/internal/daily-assistant-digest"),
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

    const { GET } = await import("../app/api/internal/daily-assistant-digest/route");
    const response = await GET(
      new Request("https://example.test/api/internal/daily-assistant-digest"),
    );

    expect(response.status).toBe(401);
    expect(fetchAllShopIdsMock).not.toHaveBeenCalled();
  });

  it("sweeps every shop and aggregates the summary", async () => {
    fetchAllShopIdsMock.mockResolvedValue(["shop_1", "shop_2"]);
    deliverDailyAssistantDigestMock
      .mockResolvedValueOnce({
        shopId: "shop_1",
        inMorningWindow: true,
        eligibleStaff: 3,
        delivered: 2,
        alreadyDelivered: 1,
        errors: [],
      })
      .mockResolvedValueOnce({
        shopId: "shop_2",
        inMorningWindow: false,
        eligibleStaff: 0,
        delivered: 0,
        alreadyDelivered: 0,
        errors: [],
      });

    const { GET } = await import("../app/api/internal/daily-assistant-digest/route");
    const response = await GET(
      new Request("https://example.test/api/internal/daily-assistant-digest"),
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      checkedShops: 2,
      inMorningWindow: 1,
      delivered: 2,
      alreadyDelivered: 1,
      warnings: [],
    });
    expect(deliverDailyAssistantDigestMock).toHaveBeenCalledTimes(2);
  });

  it("reports a per-shop failure as a warning instead of failing the whole run", async () => {
    fetchAllShopIdsMock.mockResolvedValue(["shop_1", "shop_2"]);
    deliverDailyAssistantDigestMock
      .mockResolvedValueOnce({
        shopId: "shop_1",
        inMorningWindow: false,
        eligibleStaff: 0,
        delivered: 0,
        alreadyDelivered: 0,
        errors: [],
      })
      .mockRejectedValueOnce(new Error("boom"));

    const { GET } = await import("../app/api/internal/daily-assistant-digest/route");
    const response = await GET(
      new Request("https://example.test/api/internal/daily-assistant-digest"),
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.warnings).toEqual([{ shopId: "shop_2", error: "boom" }]);
  });

  it("returns 500 when the shop list cannot be loaded", async () => {
    fetchAllShopIdsMock.mockRejectedValue(new Error("Database unavailable"));

    const { GET } = await import("../app/api/internal/daily-assistant-digest/route");
    const response = await GET(
      new Request("https://example.test/api/internal/daily-assistant-digest"),
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(500);
    expect(body.error).toBe("Database unavailable");
    expect(deliverDailyAssistantDigestMock).not.toHaveBeenCalled();
  });
});
