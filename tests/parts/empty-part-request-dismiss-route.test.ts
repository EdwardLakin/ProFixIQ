import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireShopScopedApiAccess: vi.fn(),
  logOperationalEvent: vi.fn(),
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireShopScopedApiAccess,
}));

vi.mock("@/features/work-orders/server/logOperationalEvent", () => ({
  logOperationalEvent: mocks.logOperationalEvent,
}));

const requestId = "11111111-1111-4111-8111-111111111111";

type RpcResult = {
  data: unknown;
  error: {
    message: string;
    details?: string | null;
    hint?: string | null;
  } | null;
};

function buildSupabase(result: RpcResult) {
  return {
    rpc: vi.fn(async () => result),
    from: vi.fn(() => {
      throw new Error("The route must not write part_requests directly.");
    }),
  };
}

async function post(supabase: ReturnType<typeof buildSupabase>) {
  mocks.requireShopScopedApiAccess.mockResolvedValue({
    ok: true,
    profile: { id: "actor-1", shop_id: "shop-1" },
    supabase,
  });
  const { POST } = await import(
    "../../app/api/parts/requests/[requestId]/dismiss-empty/route"
  );
  return POST(new Request("http://localhost"), {
    params: Promise.resolve({ requestId }),
  });
}

describe("dismiss empty parts request route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates dismissal to the shop-scoped atomic RPC", async () => {
    const db = buildSupabase({
      data: {
        ok: true,
        idempotent: false,
        request_id: requestId,
        work_order_id: "work-order-1",
        previous_status: "approved",
        status: "cancelled",
      },
      error: null,
    });

    const response = await post(db);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      idempotent: false,
      requestId,
      status: "cancelled",
    });
    expect(mocks.requireShopScopedApiAccess).toHaveBeenCalledWith({
      allowRoles: ["owner", "admin", "manager", "advisor", "parts"],
    });
    expect(db.rpc).toHaveBeenCalledWith("parts_dismiss_empty_request_atomic", {
      p_shop_id: "shop-1",
      p_request_id: requestId,
      p_actor_user_id: "actor-1",
    });
    expect(db.from).not.toHaveBeenCalled();
    expect(mocks.logOperationalEvent).toHaveBeenCalledOnce();
  });

  it("treats a repeated atomic cancellation as a successful replay", async () => {
    const db = buildSupabase({
      data: {
        ok: true,
        idempotent: true,
        request_id: requestId,
        previous_status: "cancelled",
        status: "cancelled",
      },
      error: null,
    });

    const response = await post(db);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      idempotent: true,
      status: "cancelled",
    });
    expect(mocks.logOperationalEvent).not.toHaveBeenCalled();
  });

  it.each([
    ["PARTS_ROLE_ACCESS_DENIED", 403],
    ["PARTS_REQUEST_NOT_FOUND_FOR_SHOP", 404],
    ["PARTS_REQUEST_NOT_EMPTY", 409],
  ])("maps %s to HTTP %s", async (message, status) => {
    const db = buildSupabase({
      data: null,
      error: { message },
    });

    const response = await post(db);

    expect(response.status).toBe(status);
    expect(mocks.logOperationalEvent).not.toHaveBeenCalled();
  });

  it("rejects malformed request IDs before authorization or mutation", async () => {
    const { POST } = await import(
      "../../app/api/parts/requests/[requestId]/dismiss-empty/route"
    );
    const response = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ requestId: "not-a-uuid" }),
    });

    expect(response.status).toBe(400);
    expect(mocks.requireShopScopedApiAccess).not.toHaveBeenCalled();
  });
});
