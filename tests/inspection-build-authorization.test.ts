import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireShopScopedApiAccess: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireShopScopedApiAccess,
}));

describe("legacy inspection builder authorization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an unauthenticated caller before reading its prompt", async () => {
    mocks.requireShopScopedApiAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 },
      ),
    });
    const json = vi.fn();
    const { POST } = await import("../app/api/inspections/build/route");

    const response = await POST({ json } as never);

    expect(response.status).toBe(401);
    expect(json).not.toHaveBeenCalled();
    expect(mocks.requireShopScopedApiAccess).toHaveBeenCalledWith({
      requiredCapability: "canRunInspections",
      requiredProductCapabilities: ["shop", "field_service"],
    });
  });

  it("preserves deterministic generation for an authorized Shop or Field inspector", async () => {
    mocks.requireShopScopedApiAccess.mockResolvedValue({
      ok: true,
      authUserId: "auth-user-1",
      canonicalRole: "mechanic",
      profile: { id: "profile-1", shop_id: "shop-1", role: "mechanic" },
      supabase: {},
    });
    const { POST } = await import("../app/api/inspections/build/route");
    const response = await POST(
      new Request("https://profixiq.test/api/inspections/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "brake inspection",
          vehicleType: "truck",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ sections: expect.any(Array) }),
    );
  });
});
