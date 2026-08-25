import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getActorCapabilities } from "@/features/shared/lib/rbac";

const mocks = vi.hoisted(() => ({
  createAdminSupabase: vi.fn(),
  requireShopScopedApiAccess: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireShopScopedApiAccess,
}));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: mocks.createAdminSupabase,
}));

import { POST } from "../app/api/work-orders/lines/[id]/delete-or-void/route";

const SHOP_ID = "00000000-0000-4000-8000-000000000401";
const LINE_ID = "00000000-0000-4000-8000-000000000402";
const PROFILE_ID = "00000000-0000-4000-8000-000000000403";
const AUTH_USER_ID = "00000000-0000-4000-8000-000000000404";
const IDEMPOTENCY_KEY = "00000000-0000-4000-8000-000000000405";

function request(): Request {
  return new Request(
    `http://localhost/api/work-orders/lines/${LINE_ID}/delete-or-void`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": IDEMPOTENCY_KEY,
      },
      body: JSON.stringify({
        mode: "void",
        consumedDisposition: "keep_consumed",
        reason: "Customer declined",
        note: null,
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    },
  );
}

describe("work-order line delete/void route authorization", () => {
  beforeEach(() => {
    mocks.createAdminSupabase.mockReset();
    mocks.requireShopScopedApiAccess.mockReset();
    mocks.rpc.mockReset();
    mocks.createAdminSupabase.mockReturnValue({ rpc: mocks.rpc });
    mocks.requireShopScopedApiAccess.mockResolvedValue({
      ok: true,
      authUserId: AUTH_USER_ID,
      canonicalRole: "service",
      profile: {
        id: PROFILE_ID,
        shop_id: SHOP_ID,
        role: "service",
      },
      supabase: {},
    });
    mocks.rpc.mockResolvedValue({
      data: { ok: true, mode: "voided", idempotent: false },
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("capability-gates the mutation and attributes imported profiles to the auth user", async () => {
    const response = await POST(request(), {
      params: Promise.resolve({ id: LINE_ID }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      mode: "voided",
    });
    expect(mocks.requireShopScopedApiAccess).toHaveBeenCalledWith({
      requiredCapability: "canManageWorkOrders",
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "parts_void_work_order_line_atomic",
      expect.objectContaining({
        p_shop_id: SHOP_ID,
        p_work_order_line_id: LINE_ID,
        p_mode: "void",
        p_reserved_disposition: "release",
        p_ordered_disposition: "cancel_open_order",
        p_received_disposition: "retain_for_other_work",
        p_consumed_disposition: "keep_consumed",
        p_operation_key: `${SHOP_ID}:line-void:${IDEMPOTENCY_KEY}`,
        p_actor_user_id: AUTH_USER_ID,
      }),
    );
    expect(PROFILE_ID).not.toBe(AUTH_USER_ID);
  });

  it("does not create a privileged client when capability access is denied", async () => {
    mocks.requireShopScopedApiAccess.mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    });

    const response = await POST(request(), {
      params: Promise.resolve({ id: LINE_ID }),
    });

    expect(response.status).toBe(403);
    expect(mocks.createAdminSupabase).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("uses the same canonical capability in the workspace presentation", () => {
    for (const role of [
      "owner",
      "admin",
      "manager",
      "advisor",
      "service",
      "service_advisor",
      "lead_hand",
      "leadhand",
      "foreman",
    ]) {
      expect(getActorCapabilities({ role }).canManageWorkOrders).toBe(true);
    }

    for (const role of ["parts", "mechanic", "customer", "driver", null]) {
      expect(getActorCapabilities({ role }).canManageWorkOrders).toBe(false);
    }

    const detailClient = readFileSync(
      "app/work-orders/[id]/Client.tsx",
      "utf8",
    );
    expect(detailClient).toContain(
      "const canDeleteLine = currentActor.canManageWorkOrders",
    );
    expect(detailClient).not.toContain("LINE_DELETE_ROLES");
  });
});
