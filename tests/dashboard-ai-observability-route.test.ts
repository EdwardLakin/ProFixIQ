import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const requireShopScopedApiAccessMock = vi.fn();
const getAiOperationsObservabilityMock = vi.fn();

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: requireShopScopedApiAccessMock,
}));

vi.mock("@/features/ai/server", () => ({
  getAiOperationsObservability: getAiOperationsObservabilityMock,
}));

describe("GET /api/dashboard/ai-observability", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    requireShopScopedApiAccessMock.mockResolvedValue({
      ok: true,
      profile: { id: "actor_1", role: "owner", shop_id: "shop_1" },
      supabase: {},
    });

    getAiOperationsObservabilityMock.mockResolvedValue({
      generatedAt: "2026-04-24T12:00:00.000Z",
      recommendations: { totalActive: 2 },
      health: { cronProbablyRunning: true },
    });
  });

  it("rejects unauthenticated users", async () => {
    requireShopScopedApiAccessMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    });

    const { GET } = await import("../app/api/dashboard/ai-observability/route");
    const response = await GET();

    expect(response.status).toBe(401);
    expect(getAiOperationsObservabilityMock).not.toHaveBeenCalled();
  });

  it("returns success with safe response shape", async () => {
    const { GET } = await import("../app/api/dashboard/ai-observability/route");
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body.observability).toBeTruthy();
    expect(body.preview_payload).toBeUndefined();
    expect(body.owner_pin_verification_ref).toBeUndefined();
  });
});
