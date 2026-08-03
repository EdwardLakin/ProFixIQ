import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const requireShopScopedApiAccessMock = vi.fn();
const getOperationalObservabilityMock = vi.fn();
const getAiOperationsObservabilityMock = vi.fn();

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: requireShopScopedApiAccessMock,
}));

vi.mock("@/features/operations/server/getOperationalObservability", () => ({
  getOperationalObservability: getOperationalObservabilityMock,
}));

vi.mock("@/features/ai/server", () => ({
  getAiOperationsObservability: getAiOperationsObservabilityMock,
}));

describe("GET /api/dashboard/operational-observability", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    requireShopScopedApiAccessMock.mockResolvedValue({
      ok: true,
      profile: { id: "actor_1", role: "owner", shop_id: "shop_1" },
      canonicalRole: "owner",
      authUserId: "auth_1",
      supabase: {},
    });

    getOperationalObservabilityMock.mockResolvedValue({
      installed: true,
      pipeline: { status: "healthy", unresolvedFailures: 0 },
      events: [],
      failures: [],
    });

    getAiOperationsObservabilityMock.mockResolvedValue({
      generatedAt: "2026-08-02T14:00:00.000Z",
      recommendations: {
        totalActive: 9,
        stale: 2,
        highOrCriticalRisk: 0,
        needsRefresh: 2,
        byDomain: { work_orders: 3, shop_boost: 0 },
      },
      approvals: {
        pending: 0,
        approved: 0,
        rejected: 0,
        ownerPinRequiredCount: 0,
      },
      expiration: { lastExpirationEventAt: null },
      events: { lastEventAt: null, recentErrorLikeByType: [] },
      health: {
        cronProbablyRunning: false,
        hasStaleBacklog: true,
        hasHighRiskBacklog: false,
        hasPendingApprovalBacklog: false,
        hasRecentAiActivity: false,
      },
    });
  });

  it("rejects unauthenticated users", async () => {
    requireShopScopedApiAccessMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    });

    const { GET } = await import(
      "../app/api/dashboard/operational-observability/route"
    );
    const response = await GET(
      new Request("https://example.test/api/dashboard/operational-observability"),
    );

    expect(response.status).toBe(401);
    expect(getOperationalObservabilityMock).not.toHaveBeenCalled();
  });

  it("rejects invalid entity filters", async () => {
    const { GET } = await import(
      "../app/api/dashboard/operational-observability/route"
    );
    const response = await GET(
      new Request(
        "https://example.test/api/dashboard/operational-observability?entityId=not-a-uuid",
      ),
    );

    expect(response.status).toBe(400);
    expect(getOperationalObservabilityMock).not.toHaveBeenCalled();
  });

  it("enforces shop scope and returns a safe combined health payload", async () => {
    const { GET } = await import(
      "../app/api/dashboard/operational-observability/route"
    );
    const response = await GET(
      new Request(
        "https://example.test/api/dashboard/operational-observability?entityType=work_order&entityId=11111111-1111-4111-8111-111111111111",
      ),
    );

    expect(response.status).toBe(200);
    expect(getOperationalObservabilityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: "shop_1",
        entityType: "work_order",
        entityId: "11111111-1111-4111-8111-111111111111",
      }),
    );
    expect(getAiOperationsObservabilityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorContext: expect.objectContaining({ shopId: "shop_1" }),
      }),
    );

    const body = (await response.json()) as Record<string, unknown>;
    expect(body.operational).toBeTruthy();
    expect(body.ai).toBeTruthy();
    expect(JSON.stringify(body)).not.toContain("preview_payload");
    expect(JSON.stringify(body)).not.toContain("owner_pin_verification_ref");
  });
});
