import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAccess: vi.fn(),
  createAdmin: vi.fn(),
  resolveProductAuthority: vi.fn(),
}));

vi.mock("@/features/mobile/service/server/access", () => ({
  resolveWorkOrderProductAuthority: mocks.resolveProductAuthority,
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireAccess,
}));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: mocks.createAdmin,
}));

import { requireJobPunchActorAccess } from "@/features/work-orders/server/authorizeJobPunchTransition";

type QueryResult = { data: unknown; error: { message: string } | null };

function chain(result: QueryResult) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(async () => result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  return query;
}

function installAdmin(input?: { line?: QueryResult; receipt?: QueryResult }) {
  const line = chain(
    input?.line ?? {
      data: {
        id: "line-1",
        shop_id: "shop-1",
        work_order_id: "work-order-1",
        line_type: "job",
        assigned_tech_id: "profile-1",
        assigned_to: null,
      },
      error: null,
    },
  );
  const receipt = chain(input?.receipt ?? { data: null, error: null });
  const from = vi.fn((table: string) =>
    table === "work_order_lines" ? line : receipt,
  );
  mocks.createAdmin.mockReturnValue({ from });
  return { from, line };
}

describe("direct job-punch route authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveProductAuthority.mockResolvedValue({
      authorized: true,
      product: "shop",
    });
    mocks.requireAccess.mockResolvedValue({
      ok: true,
      profile: { id: "profile-1", shop_id: "shop-1", role: "mechanic" },
      canonicalRole: "mechanic",
      authUserId: "auth-1",
      supabase: { rpc: vi.fn() },
    });
  });

  it("requires a canonical shop actor before delegating to the receipt-aware RPC", async () => {
    const response = new Response(null, { status: 403 });
    mocks.requireAccess.mockResolvedValueOnce({ ok: false, response });

    const result = await requireJobPunchActorAccess({
      lineId: "line-1",
      action: "start",
      operationKey: "operation-1",
    });

    expect(result).toEqual({ ok: false, response });
    expect(mocks.requireAccess).toHaveBeenCalledWith();
    expect(mocks.createAdmin).not.toHaveBeenCalled();
  });

  it("accepts canonical imported-profile assignment", async () => {
    installAdmin();

    const result = await requireJobPunchActorAccess({
      lineId: "line-1",
      action: "start",
      operationKey: "operation-1",
    });

    expect(result).toMatchObject({
      ok: true,
      line: { id: "line-1", shop_id: "shop-1" },
      access: { authUserId: "auth-1", profile: { id: "profile-1" } },
    });
  });

  it("accepts an actor-bound receipt before current product authority", async () => {
    installAdmin({
      line: {
        data: {
          id: "line-1",
          shop_id: "shop-1",
          work_order_id: "work-order-1",
          line_type: "job",
          assigned_tech_id: "another-profile",
          assigned_to: null,
        },
        error: null,
      },
      receipt: {
        data: {
          actor_user_id: "auth-1",
          work_order_line_id: "line-1",
        },
        error: null,
      },
    });
    mocks.resolveProductAuthority.mockResolvedValueOnce({
      authorized: false,
      product: null,
    });

    const result = await requireJobPunchActorAccess({
      lineId: "line-1",
      action: "finish",
      operationKey: "committed-operation",
    });

    expect(result.ok).toBe(true);
    expect(mocks.resolveProductAuthority).not.toHaveBeenCalled();
  });

  it("fails closed for a foreign-tenant line", async () => {
    installAdmin({
      line: { data: null, error: null },
    });
    const foreign = await requireJobPunchActorAccess({
      lineId: "foreign-line",
      action: "start",
      operationKey: "operation-1",
    });
    expect(foreign).toMatchObject({
      ok: false,
      response: { status: 404 },
    });
  });
});
