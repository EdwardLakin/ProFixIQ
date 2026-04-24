import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const requireShopScopedApiAccessMock = vi.fn();
const bulkUpdateAiRecommendationsForReviewMock = vi.fn();

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: requireShopScopedApiAccessMock,
}));

vi.mock("@/features/ai/server", () => ({
  BULK_RECOMMENDATION_MAX_LIMIT: 100,
  bulkUpdateAiRecommendationsForReview: bulkUpdateAiRecommendationsForReviewMock,
}));

describe("POST /api/ai/recommendations/bulk-lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    requireShopScopedApiAccessMock.mockResolvedValue({
      ok: true,
      profile: { id: "actor_1", role: "manager", shop_id: "shop_1" },
      supabase: {},
    });
    bulkUpdateAiRecommendationsForReviewMock.mockResolvedValue({
      matchedCount: 4,
      updatedCount: 3,
      skippedCount: 1,
      action: "dismiss",
      domain: "work_orders",
      executionBlocked: true,
      sampleUpdatedIds: ["rec_1"],
    });
  });

  it("rejects unauthenticated callers", async () => {
    requireShopScopedApiAccessMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    });

    const { POST } = await import("../app/api/ai/recommendations/bulk-lifecycle/route");
    const response = await POST(new Request("http://localhost/api/ai/recommendations/bulk-lifecycle", { method: "POST", body: "{}" }));

    expect(response.status).toBe(401);
    expect(bulkUpdateAiRecommendationsForReviewMock).not.toHaveBeenCalled();
  });

  it("rejects invalid input", async () => {
    const { POST } = await import("../app/api/ai/recommendations/bulk-lifecycle/route");
    const response = await POST(new Request("http://localhost/api/ai/recommendations/bulk-lifecycle", {
      method: "POST",
      body: JSON.stringify({ action: "dismiss", domain: "work_orders", confirm: "DISMISS_WORK_ORDERS_RECOMMENDATIONS", limit: 999 }),
    }));

    expect(response.status).toBe(400);
    expect(bulkUpdateAiRecommendationsForReviewMock).not.toHaveBeenCalled();
  });

  it("returns safe success response shape", async () => {
    const { POST } = await import("../app/api/ai/recommendations/bulk-lifecycle/route");
    const response = await POST(new Request("http://localhost/api/ai/recommendations/bulk-lifecycle", {
      method: "POST",
      body: JSON.stringify({
        action: "dismiss",
        domain: "work_orders",
        confirm: "DISMISS_WORK_ORDERS_RECOMMENDATIONS",
        limit: 25,
        filters: { status: "open", risk: "high" },
      }),
    }));

    expect(response.status).toBe(200);
    const json = await response.json() as Record<string, unknown>;
    expect(json.updatedCount).toBe(3);
    expect(json.executionBlocked).toBe(true);
    expect(json.snapshot).toBeUndefined();
    expect(json.metadata).toBeUndefined();
  });
});
