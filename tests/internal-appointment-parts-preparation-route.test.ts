import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const requireInternalApiSecretMock = vi.fn();
const createAdminSupabaseMock = vi.fn();
const syncAppointmentPartsPreparationMock = vi.fn();
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

vi.mock("@/features/operations/server/syncAppointmentPartsPreparation", () => ({
  syncAppointmentPartsPreparation: syncAppointmentPartsPreparationMock,
}));

describe("GET /api/internal/appointment-parts-preparation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    requireInternalApiSecretMock.mockReturnValue({ ok: true });
    createAdminSupabaseMock.mockReturnValue({});
    syncAppointmentPartsPreparationMock.mockResolvedValue({
      shopId: "shop_1",
      evaluated: 0,
      eligible: 0,
      executed: 0,
      errors: [],
    });
  });

  it("uses the shared guard with Vercel cron bearer authorization enabled", async () => {
    fetchAllShopIdsMock.mockResolvedValue(["shop_1"]);

    const { GET } = await import("../app/api/internal/appointment-parts-preparation/route");
    const response = await GET(
      new Request("https://example.test/api/internal/appointment-parts-preparation"),
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

    const { GET } = await import("../app/api/internal/appointment-parts-preparation/route");
    const response = await GET(
      new Request("https://example.test/api/internal/appointment-parts-preparation"),
    );

    expect(response.status).toBe(401);
    expect(fetchAllShopIdsMock).not.toHaveBeenCalled();
  });

  it("syncs every shop and aggregates the summary", async () => {
    fetchAllShopIdsMock.mockResolvedValue(["shop_1", "shop_2"]);
    syncAppointmentPartsPreparationMock
      .mockResolvedValueOnce({ shopId: "shop_1", evaluated: 3, eligible: 2, executed: 0, errors: [] })
      .mockResolvedValueOnce({ shopId: "shop_2", evaluated: 0, eligible: 0, executed: 0, errors: [] });

    const { GET } = await import("../app/api/internal/appointment-parts-preparation/route");
    const response = await GET(
      new Request("https://example.test/api/internal/appointment-parts-preparation"),
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, checkedShops: 2, evaluated: 3, eligible: 2, executed: 0, warnings: [] });
    expect(syncAppointmentPartsPreparationMock).toHaveBeenCalledTimes(2);
  });

  it("reports a per-shop failure as a warning instead of failing the whole run", async () => {
    fetchAllShopIdsMock.mockResolvedValue(["shop_1", "shop_2"]);
    syncAppointmentPartsPreparationMock
      .mockResolvedValueOnce({ shopId: "shop_1", evaluated: 0, eligible: 0, executed: 0, errors: [] })
      .mockRejectedValueOnce(new Error("boom"));

    const { GET } = await import("../app/api/internal/appointment-parts-preparation/route");
    const response = await GET(
      new Request("https://example.test/api/internal/appointment-parts-preparation"),
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.warnings).toEqual([{ shopId: "shop_2", error: "boom" }]);
  });

  it("returns 500 when the shop list cannot be loaded", async () => {
    fetchAllShopIdsMock.mockRejectedValue(new Error("Database unavailable"));

    const { GET } = await import("../app/api/internal/appointment-parts-preparation/route");
    const response = await GET(
      new Request("https://example.test/api/internal/appointment-parts-preparation"),
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(500);
    expect(body.error).toBe("Database unavailable");
    expect(syncAppointmentPartsPreparationMock).not.toHaveBeenCalled();
  });
});
