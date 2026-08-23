import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireShopScopedApiAccess: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireShopScopedApiAccess,
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ rpc: mocks.rpc })),
}));

function request(body: Record<string, unknown>, operationKey: string) {
  return new Request("https://profixiq.test/api/work-orders/assign-line", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": operationKey,
    },
    body: JSON.stringify(body),
  });
}

describe("PFX-004 line assignment route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
    mocks.requireShopScopedApiAccess.mockResolvedValue({
      ok: true,
      profile: { id: "manager-1", shop_id: "shop-1" },
    });
    mocks.rpc.mockResolvedValue({
      data: { ok: true, primary_technician_id: "tech-1" },
      error: null,
    });
  });

  it("sends an explicit primary mutation with a concurrency precondition", async () => {
    const { POST } = await import("../app/api/work-orders/assign-line/route");
    const response = await POST(
      request(
        {
          work_order_line_id: "line-1",
          tech_id: "tech-1",
          action: "set_primary",
          expected_updated_at: "2026-08-22T12:00:00.000Z",
        },
        "set-primary-key",
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "assign_work_order_line_technician_atomic",
      expect.objectContaining({
        p_shop_id: "shop-1",
        p_work_order_line_id: "line-1",
        p_technician_id: "tech-1",
        p_actor_user_id: "manager-1",
        p_action: "set_primary",
        p_expected_updated_at: "2026-08-22T12:00:00.000Z",
      }),
    );
  });

  it("clears without defaulting to the actor or first technician", async () => {
    mocks.rpc.mockResolvedValue({
      data: { ok: true, primary_technician_id: null, technician_ids: [] },
      error: null,
    });
    const { POST } = await import("../app/api/work-orders/assign-line/route");
    const response = await POST(
      request(
        { work_order_line_id: "line-1", tech_id: null, action: "clear" },
        "clear-key",
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "assign_work_order_line_technician_atomic",
      expect.objectContaining({
        p_technician_id: null,
        p_action: "clear",
      }),
    );
  });

  it("returns a recoverable conflict for concurrent stale edits", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: {
        message: "ASSIGNMENT_STALE: reload the job",
        details: null,
        hint: null,
      },
    });
    const { POST } = await import("../app/api/work-orders/assign-line/route");
    const response = await POST(
      request(
        { work_order_line_id: "line-1", tech_id: "tech-2" },
        "stale-key",
      ),
    );
    expect(response.status).toBe(409);
  });

  it("denies unauthorized roles before opening a service mutation", async () => {
    mocks.requireShopScopedApiAccess.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Forbidden" }, { status: 403 }),
    });
    const { POST } = await import("../app/api/work-orders/assign-line/route");
    const response = await POST(
      request(
        { work_order_line_id: "line-1", tech_id: "tech-1" },
        "denied-key",
      ),
    );
    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
