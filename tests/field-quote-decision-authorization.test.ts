import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireShopScopedApiAccess: vi.fn(),
  resolveWorkOrderProductAuthority: vi.fn(),
  applyWorkOrderQuoteLineDecision: vi.fn(),
  quoteSingle: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireShopScopedApiAccess,
}));
vi.mock("@/features/mobile/service/server/access", () => ({
  resolveWorkOrderProductAuthority: mocks.resolveWorkOrderProductAuthority,
}));
vi.mock("@/features/work-orders/server/workOrderQuoteLineApproval", () => ({
  applyWorkOrderQuoteLineDecision: mocks.applyWorkOrderQuoteLineDecision,
}));

function access() {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.single = mocks.quoteSingle;
  return {
    ok: true as const,
    authUserId: "auth-user-1",
    canonicalRole: "owner",
    profile: {
      id: "profile-1",
      shop_id: "shop-1",
      role: "owner",
    },
    supabase: { from: vi.fn(() => query) },
  };
}

function request(action: "authorize" | "decline") {
  return new NextRequest(
    `https://profixiq.test/api/work-orders/quotes/quote-1/${action}`,
    { method: "POST" },
  );
}

describe("Field quote decision authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireShopScopedApiAccess.mockResolvedValue(access());
    mocks.quoteSingle.mockResolvedValue({
      data: {
        id: "quote-1",
        shop_id: "shop-1",
        work_order_id: "wo-field-1",
        work_order_line_id: null,
      },
      error: null,
    });
    mocks.resolveWorkOrderProductAuthority.mockResolvedValue({
      authorized: true,
      product: "field",
    });
    mocks.applyWorkOrderQuoteLineDecision.mockResolvedValue({
      ok: true,
      workOrderLineIds: ["line-1"],
      approvalState: "approved",
      partRelink: null,
    });
  });

  it("rejects an unrelated Field Work Order before applying the decision", async () => {
    mocks.resolveWorkOrderProductAuthority.mockResolvedValue({
      authorized: false,
      product: null,
    });
    const { POST } =
      await import("../app/api/work-orders/quotes/[id]/authorize/route");

    const response = await POST(request("authorize"));

    expect(response.status).toBe(403);
    expect(mocks.resolveWorkOrderProductAuthority).toHaveBeenCalledWith(
      expect.objectContaining({ authUserId: "auth-user-1" }),
      "wo-field-1",
    );
    expect(mocks.applyWorkOrderQuoteLineDecision).not.toHaveBeenCalled();
  });

  it.each(["authorize", "decline"] as const)(
    "uses exact linked authority and the authenticated actor for %s",
    async (action) => {
      const route =
        action === "authorize"
          ? await import("../app/api/work-orders/quotes/[id]/authorize/route")
          : await import("../app/api/work-orders/quotes/[id]/decline/route");

      const response = await route.POST(request(action));

      expect(response.status).toBe(200);
      expect(mocks.requireShopScopedApiAccess).toHaveBeenCalledWith({
        requiredCapability: "canAuthorizeQuotes",
        requiredProductCapabilities: ["shop", "field_service"],
      });
      expect(mocks.resolveWorkOrderProductAuthority).toHaveBeenCalledWith(
        expect.objectContaining({ authUserId: "auth-user-1" }),
        "wo-field-1",
      );
      expect(mocks.applyWorkOrderQuoteLineDecision).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: "auth-user-1",
          shopId: "shop-1",
          workOrderId: "wo-field-1",
        }),
      );
    },
  );
});
