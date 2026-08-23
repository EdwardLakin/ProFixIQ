import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireShopScopedApiAccess: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireShopScopedApiAccess,
}));
vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: vi.fn(async () => ({ rpc: mocks.rpc })),
}));

function request(body: Record<string, unknown>, operationKey?: string) {
  return new Request("https://profixiq.test/api/work-orders/assign-all", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(operationKey ? { "Idempotency-Key": operationKey } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("PFX-004 bulk primary assignment route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireShopScopedApiAccess.mockResolvedValue({
      ok: true,
      profile: { id: "manager-1", shop_id: "shop-1" },
    });
    mocks.rpc.mockResolvedValue({
      data: { ok: true, updated_count: 2 },
      error: null,
    });
  });

  it("requires a stable operation key", async () => {
    const { POST } = await import("../app/api/work-orders/assign-all/route");
    const response = await POST(
      request({ work_order_id: "wo-1", tech_id: "tech-1" }),
    );

    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("calls the single transactional bulk RPC in the authenticated shop", async () => {
    const { POST } = await import("../app/api/work-orders/assign-all/route");
    const response = await POST(
      request(
        {
          work_order_id: "wo-1",
          tech_id: "tech-1",
          only_unassigned: true,
        },
        "stable-bulk-key",
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "assign_work_order_primary_technician_bulk_atomic",
      {
        p_shop_id: "shop-1",
        p_work_order_id: "wo-1",
        p_technician_id: "tech-1",
        p_actor_user_id: "manager-1",
        p_only_unassigned: true,
        p_operation_key:
          "shop-1:bulk-primary-assignment:stable-bulk-key",
      },
    );
  });

  it("returns a non-disclosing missing response for another shop", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: {
        message: "Work order not found for shop.",
        details: null,
        hint: null,
      },
    });
    const { POST } = await import("../app/api/work-orders/assign-all/route");
    const response = await POST(
      request(
        { work_order_id: "other-shop-wo", tech_id: "tech-1" },
        "cross-shop-key",
      ),
    );

    expect(response.status).toBe(404);
  });

  it("does not call the service mutation when the role is denied", async () => {
    mocks.requireShopScopedApiAccess.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Forbidden" }, { status: 403 }),
    });
    const { POST } = await import("../app/api/work-orders/assign-all/route");
    const response = await POST(
      request(
        { work_order_id: "wo-1", tech_id: "tech-1" },
        "denied-key",
      ),
    );

    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
