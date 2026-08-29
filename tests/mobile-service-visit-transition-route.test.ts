import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireShopScopedApiAccess: vi.fn(),
  requireMobileServiceOperatorApiAccess: vi.fn(),
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireShopScopedApiAccess,
}));
vi.mock("@/features/mobile/service/server/access", () => ({
  requireMobileServiceOperatorApiAccess:
    mocks.requireMobileServiceOperatorApiAccess,
}));

import { POST } from "@/app/api/mobile/service-visits/[id]/transition/route";

const request = () =>
  new Request("http://localhost/api/mobile/service-visits/visit-1/transition", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fromStatus: "dispatched",
      toStatus: "en_route",
      expectedVersion: 2,
      operationKey: "field:test:transition",
    }),
  });

const context = { params: Promise.resolve({ id: "visit-1" }) };

describe("mobile Service Visit transition route committed retries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recovers an actor-owned committed receipt before the revocable Field gate", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({
        data: { ok: true, idempotent: true },
        error: null,
      });
    mocks.requireShopScopedApiAccess.mockResolvedValue({
      ok: true,
      authUserId: "user-1",
      profile: { id: "profile-1", shop_id: "shop-1" },
      supabase: { rpc },
    });

    const response = await POST(request(), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      idempotent: true,
    });
    expect(mocks.requireMobileServiceOperatorApiAccess).not.toHaveBeenCalled();
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "mobile_service_visit_transition_receipt_exists",
      "mobile_replay_service_visit_transition_atomic",
    ]);
  });

  it("retains the current Field gate for a fresh transition", async () => {
    const preflightRpc = vi
      .fn()
      .mockResolvedValue({ data: false, error: null });
    const transitionRpc = vi.fn().mockResolvedValue({
      data: { ok: true, idempotent: false },
      error: null,
    });
    mocks.requireShopScopedApiAccess.mockResolvedValue({
      ok: true,
      authUserId: "user-1",
      profile: { id: "profile-1", shop_id: "shop-1" },
      supabase: { rpc: preflightRpc },
    });
    mocks.requireMobileServiceOperatorApiAccess.mockResolvedValue({
      ok: true,
      authUserId: "user-1",
      profile: { id: "profile-1", shop_id: "shop-1" },
      supabase: { rpc: transitionRpc },
    });

    const response = await POST(request(), context);

    expect(response.status).toBe(200);
    expect(mocks.requireMobileServiceOperatorApiAccess).toHaveBeenCalledOnce();
    expect(transitionRpc).toHaveBeenCalledWith(
      "mobile_replay_service_visit_transition_atomic",
      expect.objectContaining({
        p_shop_id: "shop-1",
        p_actor_user_id: "user-1",
      }),
    );
  });
});
