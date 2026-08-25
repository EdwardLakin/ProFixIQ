import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const WORK_ORDER_ID = "11111111-1111-4111-8111-111111111111";
const LINE_ID = "22222222-2222-4222-8222-222222222222";
const SHOP_ID = "33333333-3333-4333-8333-333333333333";
const PROFILE_ID = "44444444-4444-4444-8444-444444444444";
const AUTH_USER_ID = "55555555-5555-4555-8555-555555555555";
const UPPERCASE_LINE_ID = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";

const mocks = vi.hoisted(() => ({
  requireAccess: vi.fn(),
  createAdmin: vi.fn(),
  adminRpc: vi.fn(),
  authenticatedFrom: vi.fn(),
  authenticatedRpc: vi.fn(),
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireAccess,
}));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: mocks.createAdmin,
}));

import { POST } from "../app/api/work-orders/[id]/lines/route";

function lineRequest(
  overrides: Record<string, unknown> = {},
  idempotencyKey?: string,
) {
  const body = {
    lineId: LINE_ID,
    jobName: "Replace left rear wheel speed sensor",
    notes: "Verify wiring first",
    laborHours: 1,
    parts: [{ description: "Wheel speed sensor", qty: 1 }],
    urgency: "medium",
    ...overrides,
  };
  return new Request(
    `https://profixiq.test/api/work-orders/${WORK_ORDER_ID}/lines`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey ?? String(body.lineId),
      },
      body: JSON.stringify(body),
    },
  );
}

function context(id = WORK_ORDER_ID) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});

  mocks.adminRpc.mockResolvedValue({
    data: { ok: true, line_id: LINE_ID, idempotent: false },
    error: null,
  });
  mocks.createAdmin.mockReturnValue({ rpc: mocks.adminRpc });
  mocks.requireAccess.mockResolvedValue({
    ok: true,
    authUserId: AUTH_USER_ID,
    profile: { id: PROFILE_ID, shop_id: SHOP_ID, role: "advisor" },
    supabase: {
      from: mocks.authenticatedFrom,
      rpc: mocks.authenticatedRpc,
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("manual work-order line route", () => {
  it("rejects Parts before constructing a service-role client", async () => {
    mocks.requireAccess.mockResolvedValueOnce({
      ok: true,
      authUserId: AUTH_USER_ID,
      profile: { id: PROFILE_ID, shop_id: SHOP_ID, role: "parts" },
      supabase: {
        from: mocks.authenticatedFrom,
        rpc: mocks.authenticatedRpc,
      },
    });

    const response = await POST(lineRequest(), context());

    expect(response.status).toBe(403);
    expect(mocks.requireAccess).toHaveBeenCalledWith();
    expect(mocks.createAdmin).not.toHaveBeenCalled();
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });

  it("preserves assigned-mechanic eligibility for the database assignment check", async () => {
    mocks.requireAccess.mockResolvedValueOnce({
      ok: true,
      authUserId: AUTH_USER_ID,
      profile: { id: PROFILE_ID, shop_id: SHOP_ID, role: "mechanic" },
      supabase: {
        from: mocks.authenticatedFrom,
        rpc: mocks.authenticatedRpc,
      },
    });

    const response = await POST(lineRequest(), context());

    expect(response.status).toBe(201);
    expect(mocks.adminRpc).toHaveBeenCalledOnce();
  });

  it("uses the service-only command with tenant scope and both actor identities", async () => {
    const response = await POST(
      lineRequest({
        jobName: "  Replace left rear wheel speed sensor  ",
        notes: "  Verify wiring first  ",
        laborHours: 0,
        parts: [
          { description: " Wheel speed sensor ", qty: 1 },
          { description: "Connector", qty: 2 },
        ],
      }),
      context(),
    );

    expect(response.status).toBe(201);
    expect(mocks.createAdmin).toHaveBeenCalledTimes(1);
    expect(mocks.adminRpc).toHaveBeenCalledWith(
      "create_manual_work_order_line_atomic",
      {
        p_shop_id: SHOP_ID,
        p_work_order_id: WORK_ORDER_ID,
        p_line_id: LINE_ID,
        p_authenticated_user_id: AUTH_USER_ID,
        p_actor_profile_id: PROFILE_ID,
        p_complaint: "Replace left rear wheel speed sensor",
        p_correction: "Verify wiring first",
        p_labor_time: 0,
        p_parts_text: "1x Wheel speed sensor, 2x Connector",
        p_urgency: "medium",
      },
    );
    expect(mocks.authenticatedFrom).not.toHaveBeenCalled();
    expect(mocks.authenticatedRpc).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      ok: true,
      lineId: LINE_ID,
      idempotent: false,
    });
  });

  it("preserves null correction, labor, and parts payload semantics", async () => {
    const response = await POST(
      lineRequest({ notes: "   ", laborHours: 0, parts: [] }),
      context(),
    );

    expect(response.status).toBe(201);
    expect(mocks.adminRpc).toHaveBeenCalledWith(
      "create_manual_work_order_line_atomic",
      expect.objectContaining({
        p_correction: "",
        p_labor_time: 0,
        p_parts_text: "",
      }),
    );
  });

  it("returns an exact database retry as idempotent success", async () => {
    mocks.adminRpc.mockResolvedValueOnce({
      data: { ok: true, line_id: LINE_ID, idempotent: true },
      error: null,
    });

    const response = await POST(lineRequest(), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      lineId: LINE_ID,
      idempotent: true,
    });
  });

  it("normalizes accepted uppercase UUIDs before invoking and validating the command", async () => {
    mocks.adminRpc.mockResolvedValueOnce({
      data: {
        ok: true,
        line_id: UPPERCASE_LINE_ID.toLowerCase(),
        idempotent: false,
      },
      error: null,
    });

    const response = await POST(
      lineRequest({ lineId: UPPERCASE_LINE_ID }, UPPERCASE_LINE_ID),
      context(),
    );

    expect(response.status).toBe(201);
    expect(mocks.adminRpc).toHaveBeenCalledWith(
      "create_manual_work_order_line_atomic",
      expect.objectContaining({ p_line_id: UPPERCASE_LINE_ID.toLowerCase() }),
    );
    await expect(response.json()).resolves.toMatchObject({
      lineId: UPPERCASE_LINE_ID.toLowerCase(),
    });
  });

  it("maps allowlisted conflict and lifecycle markers to stable responses", async () => {
    const cases = [
      {
        marker: "MANUAL_WORK_ORDER_LINE_ID_CONFLICT",
        message: "The line creation intent conflicts with existing data.",
      },
      {
        marker: "MANUAL_WORK_ORDER_LINE_CLOSED",
        message: "This work order is no longer editable.",
      },
      {
        marker: "MANUAL_WORK_ORDER_LINE_PAID",
        message: "This paid work order is no longer editable.",
      },
      {
        marker: "MANUAL_WORK_ORDER_LINE_FINANCIALLY_LOCKED",
        message: "This work order is financially locked.",
      },
    ] as const;

    for (const testCase of cases) {
      mocks.adminRpc.mockResolvedValueOnce({
        data: null,
        error: { code: "55000", message: testCase.marker },
      });

      const response = await POST(lineRequest(), context());
      const body = (await response.json()) as Record<string, unknown>;

      expect(response.status).toBe(409);
      expect(body).toMatchObject({ ok: false, error: testCase.message });
      expect(body.correlationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(JSON.stringify(body)).not.toContain(testCase.marker);
    }
  });

  it("maps allowlisted validation, actor, and tenant markers without leaking them", async () => {
    const cases = [
      {
        marker: "MANUAL_WORK_ORDER_LINE_INVALID_ARGUMENT",
        status: 400,
        message: "Invalid work-order line details.",
      },
      {
        marker: "MANUAL_WORK_ORDER_LINE_ACTOR_FORBIDDEN",
        status: 403,
        message: "You do not have permission to add this job.",
      },
      {
        marker: "MANUAL_WORK_ORDER_LINE_NOT_FOUND",
        status: 404,
        message: "Work order not found for this shop.",
      },
    ] as const;

    for (const testCase of cases) {
      mocks.adminRpc.mockResolvedValueOnce({
        data: null,
        error: { message: testCase.marker },
      });

      const response = await POST(lineRequest(), context());
      const body = (await response.json()) as Record<string, unknown>;

      expect(response.status).toBe(testCase.status);
      expect(body).toMatchObject({ ok: false, error: testCase.message });
      expect(body.correlationId).toEqual(expect.any(String));
      expect(JSON.stringify(body)).not.toContain(testCase.marker);
    }
  });

  it("does not expose unexpected database diagnostics", async () => {
    mocks.adminRpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: "XX000",
        message: "internal relation private.secret_table does not exist",
        details: "sensitive execution details",
      },
    });

    const response = await POST(lineRequest(), context());
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      ok: false,
      error: "Unable to add the work-order line.",
    });
    expect(body.correlationId).toEqual(expect.any(String));
    expect(JSON.stringify(body)).not.toMatch(
      /private\.secret_table|sensitive/i,
    );
  });

  it("fails safely when the command returns an invalid result", async () => {
    mocks.adminRpc.mockResolvedValueOnce({
      data: { ok: true, line_id: WORK_ORDER_ID, idempotent: false },
      error: null,
    });

    const response = await POST(lineRequest(), context());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "Unable to add the work-order line.",
      correlationId: expect.any(String),
    });
  });

  it("rejects an idempotency key that does not match the stable line UUID", async () => {
    const response = await POST(
      lineRequest({}, "77777777-7777-4777-8777-777777777777"),
      context(),
    );

    expect(response.status).toBe(400);
    expect(mocks.createAdmin).not.toHaveBeenCalled();
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });
});
