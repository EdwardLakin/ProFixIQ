import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  assignServiceVisit: vi.fn(),
  canAccessDispatchVisit: vi.fn(),
  createServiceVisit: vi.fn(),
  getDispatchBoard: vi.fn(),
  getVisitHistory: vi.fn(),
  requireShopScopedApiAccess: vi.fn(),
  rescheduleServiceVisit: vi.fn(),
  resolveDispatchProductScope: vi.fn(),
  transitionServiceVisit: vi.fn(),
  updateServiceVisit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireShopScopedApiAccess,
}));
vi.mock("@/features/dispatch/server/commands", () => ({
  assignServiceVisit: mocks.assignServiceVisit,
  createServiceVisit: mocks.createServiceVisit,
  getDispatchBoard: mocks.getDispatchBoard,
  getVisitHistory: mocks.getVisitHistory,
  rescheduleServiceVisit: mocks.rescheduleServiceVisit,
  transitionServiceVisit: mocks.transitionServiceVisit,
  updateServiceVisit: mocks.updateServiceVisit,
}));
vi.mock("@/features/dispatch/server/productScope", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/features/dispatch/server/productScope")
  >()),
  canAccessDispatchVisit: mocks.canAccessDispatchVisit,
  resolveDispatchProductScope: mocks.resolveDispatchProductScope,
}));

const VISIT_ID = "11111111-1111-4111-8111-111111111111";
const WORK_ORDER_ID = "22222222-2222-4222-8222-222222222222";

function allowedAccess(role = "manager") {
  return {
    ok: true as const,
    authUserId: "auth-user-1",
    canonicalRole: role,
    profile: { id: "profile-1", shop_id: "shop-1", role },
    supabase: { from: vi.fn() },
  };
}

describe("dispatch route product boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireShopScopedApiAccess.mockResolvedValue(allowedAccess());
    mocks.resolveDispatchProductScope.mockResolvedValue("field");
    mocks.canAccessDispatchVisit.mockResolvedValue(true);
  });

  it("filters Shop-mode visits out of the Field dispatch board", async () => {
    mocks.getDispatchBoard.mockResolvedValue({
      generatedAt: "2026-08-26T00:00:00.000Z",
      visits: [
        { id: "shop-visit", mode: "shop" },
        { id: "field-visit", mode: "mobile" },
      ],
      technicians: [],
      serviceVehicles: [],
    });
    const { GET } = await import("../app/api/dispatch/board/route");
    const response = await GET(
      new NextRequest(
        "https://profixiq.test/api/dispatch/board?startsAt=2026-08-26T00%3A00%3A00.000Z&endsAt=2026-08-27T00%3A00%3A00.000Z",
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        visits: [{ id: "field-visit", mode: "mobile" }],
      }),
    );
  });

  it("rejects a Shop-mode visit creation under Field-only authority", async () => {
    const { POST } = await import("../app/api/dispatch/visits/route");
    const response = await POST(
      new Request("https://profixiq.test/api/dispatch/visits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "dispatch-create-1",
        },
        body: JSON.stringify({ workOrderId: WORK_ORDER_ID, mode: "shop" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.createServiceVisit).not.toHaveBeenCalled();
  });

  it("checks the exact Field visit relationship before a mutation", async () => {
    mocks.requireShopScopedApiAccess.mockResolvedValue(
      allowedAccess("mechanic"),
    );
    mocks.canAccessDispatchVisit.mockResolvedValue(false);
    const { PATCH } = await import("../app/api/dispatch/visits/[id]/route");
    const response = await PATCH(
      new Request(`https://profixiq.test/api/dispatch/visits/${VISIT_ID}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "dispatch-transition-1",
        },
        body: JSON.stringify({ action: "transition", toStatus: "en_route" }),
      }),
      { params: Promise.resolve({ id: VISIT_ID }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.canAccessDispatchVisit).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "field", visitId: VISIT_ID }),
    );
    expect(mocks.transitionServiceVisit).not.toHaveBeenCalled();
  });

  it("checks the exact Field visit relationship before returning history", async () => {
    mocks.requireShopScopedApiAccess.mockResolvedValue(
      allowedAccess("mechanic"),
    );
    mocks.canAccessDispatchVisit.mockResolvedValue(false);
    const { GET } =
      await import("../app/api/dispatch/visits/[id]/history/route");
    const response = await GET(
      new Request(
        `https://profixiq.test/api/dispatch/visits/${VISIT_ID}/history`,
      ),
      { params: Promise.resolve({ id: VISIT_ID }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.getVisitHistory).not.toHaveBeenCalled();
  });
});
