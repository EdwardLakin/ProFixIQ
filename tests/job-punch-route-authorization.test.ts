import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAccess: vi.fn(),
  createAdmin: vi.fn(),
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireAccess,
}));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: mocks.createAdmin,
}));

import { requireAssignedJobPunchAccess } from "@/features/work-orders/server/authorizeJobPunchTransition";

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

function installAdmin(input?: {
  line?: QueryResult;
  assignment?: QueryResult;
}) {
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
  const assignment = chain(
    input?.assignment ?? { data: null, error: null },
  );
  const from = vi.fn((table: string) =>
    table === "work_order_lines" ? line : assignment,
  );
  mocks.createAdmin.mockReturnValue({ from });
  return { from, line, assignment };
}

describe("direct job-punch route authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAccess.mockResolvedValue({
      ok: true,
      profile: { id: "profile-1", shop_id: "shop-1", role: "mechanic" },
      canonicalRole: "mechanic",
      authUserId: "auth-1",
      supabase: { rpc: vi.fn() },
    });
  });

  it("requires the effective job-execution capability before admin lookup", async () => {
    const response = new Response(null, { status: 403 });
    mocks.requireAccess.mockResolvedValueOnce({ ok: false, response });

    const result = await requireAssignedJobPunchAccess("line-1");

    expect(result).toEqual({ ok: false, response });
    expect(mocks.requireAccess).toHaveBeenCalledWith({
      requiredWorkspaceCapability: "work_order.job.execute",
    });
    expect(mocks.createAdmin).not.toHaveBeenCalled();
  });

  it("accepts canonical imported-profile assignment", async () => {
    installAdmin();

    const result = await requireAssignedJobPunchAccess("line-1");

    expect(result).toMatchObject({
      ok: true,
      line: { id: "line-1", shop_id: "shop-1" },
      access: { authUserId: "auth-1", profile: { id: "profile-1" } },
    });
  });

  it("accepts an explicit supporting assignment linked by auth identity", async () => {
    const { assignment } = installAdmin({
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
      assignment: { data: { id: "assignment-1" }, error: null },
    });

    const result = await requireAssignedJobPunchAccess("line-1");

    expect(result.ok).toBe(true);
    expect(assignment.in).toHaveBeenCalledWith("technician_id", [
      "profile-1",
      "auth-1",
    ]);
  });

  it("fails closed for an unassigned or foreign-tenant line", async () => {
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
    });
    const unassigned = await requireAssignedJobPunchAccess("line-1");
    expect(unassigned).toMatchObject({
      ok: false,
      response: { status: 403 },
    });

    installAdmin({
      line: { data: null, error: null },
      assignment: { data: { id: "foreign-assignment" }, error: null },
    });
    const foreign = await requireAssignedJobPunchAccess("foreign-line");
    expect(foreign).toMatchObject({
      ok: false,
      response: { status: 404 },
    });
  });
});
