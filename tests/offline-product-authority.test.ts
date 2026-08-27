import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireShopScopedApiAccess: vi.fn(),
  resolveWorkOrderProductAuthority: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireShopScopedApiAccess,
}));
vi.mock("@/features/mobile/service/server/access", () => ({
  resolveWorkOrderProductAuthority: mocks.resolveWorkOrderProductAuthority,
}));

function allowedAccess() {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { work_order_id: "wo-1" },
      error: null,
    }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return {
    ok: true as const,
    authUserId: "auth-user-1",
    canonicalRole: "mechanic",
    profile: { id: "profile-1", shop_id: "shop-1", role: "mechanic" },
    supabase: { from: vi.fn().mockReturnValue(query), rpc: mocks.rpc },
  };
}

function mutationRequest() {
  return new NextRequest("https://profixiq.test/api/offline/mutations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "offline-mutation-1",
    },
    body: JSON.stringify({
      actionType: "save_story_draft",
      payload: { lineId: "line-1", cause: "cause", correction: "fix" },
    }),
  });
}

describe("offline mutation product authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireShopScopedApiAccess.mockResolvedValue(allowedAccess());
    mocks.resolveWorkOrderProductAuthority.mockResolvedValue({
      authorized: true,
      product: "field",
    });
    mocks.rpc.mockResolvedValue({ data: { ok: true }, error: null });
  });

  it("rejects an offline mutation for an unrelated Field Work Order before replay", async () => {
    mocks.resolveWorkOrderProductAuthority.mockResolvedValue({
      authorized: false,
      product: null,
    });
    const { POST } = await import("../app/api/offline/mutations/route");

    const response = await POST(mutationRequest());

    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("replays a linked mutation with the authenticated actor id", async () => {
    const { POST } = await import("../app/api/offline/mutations/route");

    const response = await POST(mutationRequest());

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "apply_offline_line_mutation_atomic",
      expect.objectContaining({
        p_actor_user_id: "auth-user-1",
        p_shop_id: "shop-1",
        p_work_order_line_id: "line-1",
      }),
    );
  });
});

describe("offline bundle product intersection", () => {
  it("keeps all assigned Work Orders for Shop but only linked mobile visits for Field", async () => {
    const { selectAuthorizedAssignedWorkOrderIds } =
      await import(
        "../features/work-orders/mobile/server/selectAuthorizedAssignedWorkOrderIds"
      );
    const assigned = [
      { work_order_id: "wo-shop-only" },
      { work_order_id: "wo-field" },
      { work_order_id: "wo-field" },
      { work_order_id: null },
    ];

    expect(selectAuthorizedAssignedWorkOrderIds(assigned, null)).toEqual([
      "wo-shop-only",
      "wo-field",
    ]);
    expect(
      selectAuthorizedAssignedWorkOrderIds(assigned, new Set(["wo-field"])),
    ).toEqual(["wo-field"]);
  });
});
