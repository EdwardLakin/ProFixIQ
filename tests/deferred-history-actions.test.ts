import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireShopScopedApiAccess: vi.fn(),
  createAdminSupabase: vi.fn(),
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireShopScopedApiAccess,
}));
vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: mocks.createAdminSupabase,
}));

import { POST as addPOST } from "../app/api/work-orders/[id]/deferred-history/add/route";
import { POST as declinePOST } from "../app/api/work-orders/[id]/deferred-history/decline/route";
import { POST as resolvePOST } from "../app/api/work-orders/[id]/deferred-history/resolve-elsewhere/route";

const SHOP = "73200000-0000-4000-8000-000000000001";
const WORK_ORDER = "73400000-0000-4000-8000-000000000020";
const QUOTE_LINE = "73600000-0000-4000-8000-000000000001";
const NEW_LINE = "73900000-0000-4000-8000-000000000001";
const ACTION_ID = "73900000-0000-4000-8000-000000000002";

type RpcResult = { data: unknown; error: { message: string } | null };

function mockAccess(role = "advisor") {
  mocks.requireShopScopedApiAccess.mockResolvedValue({
    ok: true,
    profile: { id: "profile-1", shop_id: SHOP, role },
    authUserId: "auth-user-1",
    supabase: {},
  });
}

function mockRpc(result: RpcResult) {
  const rpc = vi.fn().mockResolvedValue(result);
  mocks.createAdminSupabase.mockReturnValue({ rpc });
  return rpc;
}

function request(body: unknown, idempotencyKey?: string) {
  return new Request(
    `http://localhost/api/work-orders/${WORK_ORDER}/deferred-history/add`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
    },
  );
}

const ctx = { params: Promise.resolve({ id: WORK_ORDER }) };

describe("deferred-history add route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls the add RPC with the actor and quote line, and returns 201 on a fresh add", async () => {
    mockAccess("advisor");
    const rpc = mockRpc({
      data: { ok: true, line_id: NEW_LINE, idempotent: false },
      error: null,
    });

    const response = await addPOST(
      request({ quoteLineId: QUOTE_LINE, newLineId: NEW_LINE }, NEW_LINE),
      ctx,
    );
    const body = (await response.json()) as { ok: boolean; lineId: string };

    expect(response.status).toBe(201);
    expect(body).toMatchObject({ ok: true, lineId: NEW_LINE });
    expect(rpc).toHaveBeenCalledWith(
      "add_deferred_recommendation_to_work_order",
      expect.objectContaining({
        p_shop_id: SHOP,
        p_work_order_id: WORK_ORDER,
        p_quote_line_id: QUOTE_LINE,
        p_new_line_id: NEW_LINE,
        p_authenticated_user_id: "auth-user-1",
        p_actor_profile_id: "profile-1",
      }),
    );
  });

  it("rejects a mismatched idempotency key before calling the RPC", async () => {
    mockAccess("advisor");
    const rpc = mockRpc({
      data: { ok: true, line_id: NEW_LINE, idempotent: false },
      error: null,
    });

    const response = await addPOST(
      request(
        { quoteLineId: QUOTE_LINE, newLineId: NEW_LINE },
        "73900000-0000-4000-8000-000000000099",
      ),
      ctx,
    );

    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a mechanic (not an advisor/manager/etc) before calling the RPC", async () => {
    mockAccess("mechanic");
    const rpc = mockRpc({
      data: { ok: true, line_id: NEW_LINE, idempotent: false },
      error: null,
    });

    const response = await addPOST(
      request({ quoteLineId: QUOTE_LINE, newLineId: NEW_LINE }, NEW_LINE),
      ctx,
    );

    expect(response.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps a DEFERRED_RECOMMENDATION_WORK_ORDER_CLOSED RPC error to a 409", async () => {
    mockAccess("advisor");
    mockRpc({
      data: null,
      error: { message: "DEFERRED_RECOMMENDATION_WORK_ORDER_CLOSED" },
    });

    const response = await addPOST(
      request({ quoteLineId: QUOTE_LINE, newLineId: NEW_LINE }, NEW_LINE),
      ctx,
    );
    const body = (await response.json()) as { ok: boolean; error: string };

    expect(response.status).toBe(409);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("This work order is no longer editable.");
  });
});

describe("deferred-history decline route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls the decline RPC and returns 201 on a fresh decline", async () => {
    mockAccess("advisor");
    const rpc = mockRpc({
      data: { ok: true, quote_line_id: "73600000-0000-4000-8000-000000000009", idempotent: false },
      error: null,
    });

    const response = await declinePOST(
      new Request(
        `http://localhost/api/work-orders/${WORK_ORDER}/deferred-history/decline`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": ACTION_ID,
          },
          body: JSON.stringify({
            quoteLineId: QUOTE_LINE,
            actionId: ACTION_ID,
            note: "Customer declined again",
          }),
        },
      ),
      ctx,
    );
    const body = (await response.json()) as { ok: boolean };

    expect(response.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith(
      "decline_deferred_recommendation",
      expect.objectContaining({
        p_shop_id: SHOP,
        p_work_order_id: WORK_ORDER,
        p_quote_line_id: QUOTE_LINE,
        p_action_id: ACTION_ID,
        p_note: "Customer declined again",
      }),
    );
  });
});

describe("deferred-history resolve-elsewhere route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls the resolve RPC without requiring an idempotency key", async () => {
    mockAccess("owner");
    const rpc = mockRpc({
      data: { ok: true, quote_line_id: QUOTE_LINE, idempotent: false },
      error: null,
    });

    const response = await resolvePOST(
      new Request(
        `http://localhost/api/work-orders/${WORK_ORDER}/deferred-history/resolve-elsewhere`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quoteLineId: QUOTE_LINE }),
        },
      ),
      ctx,
    );
    const body = (await response.json()) as { ok: boolean; quoteLineId: string };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, quoteLineId: QUOTE_LINE });
    expect(rpc).toHaveBeenCalledWith(
      "resolve_deferred_recommendation_elsewhere",
      expect.objectContaining({
        p_shop_id: SHOP,
        p_work_order_id: WORK_ORDER,
        p_quote_line_id: QUOTE_LINE,
      }),
    );
  });

  it("surfaces idempotent:true when the recommendation was already resolved", async () => {
    mockAccess("owner");
    mockRpc({
      data: { ok: true, quote_line_id: QUOTE_LINE, idempotent: true },
      error: null,
    });

    const response = await resolvePOST(
      new Request(
        `http://localhost/api/work-orders/${WORK_ORDER}/deferred-history/resolve-elsewhere`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quoteLineId: QUOTE_LINE }),
        },
      ),
      ctx,
    );
    const body = (await response.json()) as { idempotent: boolean };

    expect(body.idempotent).toBe(true);
  });
});
