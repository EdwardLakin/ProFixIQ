import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const QUOTE_LINE_ID = "11111111-1111-4111-8111-111111111111";
const SHOP_ID = "22222222-2222-4222-8222-222222222222";
const ACTOR_ID = "33333333-3333-4333-8333-333333333333";

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

function request(body: Record<string, unknown>): Request {
  return new Request(
    `http://localhost/api/work-orders/quotes/${QUOTE_LINE_ID}/pricing-quarantine`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

async function callRoute(body: Record<string, unknown>) {
  const { POST } =
    await import("../app/api/work-orders/quotes/[id]/pricing-quarantine/route");
  return POST(request(body), {
    params: Promise.resolve({ id: QUOTE_LINE_ID }),
  });
}

describe("quote pricing quarantine remediation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires owner/admin pricing access before using service role", async () => {
    mocks.requireShopScopedApiAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await callRoute({ operationKey: "repair-1", items: [] });

    expect(response.status).toBe(403);
    expect(mocks.requireShopScopedApiAccess).toHaveBeenCalledWith({
      requiredCapability: "canEditPricing",
      allowRoles: ["owner", "admin"],
    });
    expect(mocks.createAdminSupabase).not.toHaveBeenCalled();
  });

  it("passes only corrected sell detail to the audited service-role RPC", async () => {
    const rpc = vi.fn(async () => ({
      data: { ok: true, idempotent: false, parts_total: 80 },
      error: null,
    }));
    mocks.requireShopScopedApiAccess.mockResolvedValue({
      ok: true,
      profile: { id: "profile-id", shop_id: SHOP_ID },
      authUserId: ACTOR_ID,
    });
    mocks.createAdminSupabase.mockReturnValue({ rpc });

    const response = await callRoute({
      operationKey: "repair-1",
      note: "Confirmed against the signed quote",
      items: [
        {
          id: "item-1",
          description: "Brake pads",
          qty: 1,
          unit_price: 80,
          unit_cost: 40,
        },
      ],
    });

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "remediate_quote_line_pricing_quarantine",
      {
        p_shop_id: SHOP_ID,
        p_quote_line_id: QUOTE_LINE_ID,
        p_actor_user_id: ACTOR_ID,
        p_items: [
          {
            id: "item-1",
            request_id: null,
            description: "Brake pads",
            qty: 1,
            unit_price: 80,
            part_number: null,
            manufacturer: null,
          },
        ],
        p_operation_key: "repair-1",
        p_note: "Confirmed against the signed quote",
      },
    );
  });

  it("rejects over-precision sell detail before service-role access", async () => {
    mocks.requireShopScopedApiAccess.mockResolvedValue({
      ok: true,
      profile: { id: "profile-id", shop_id: SHOP_ID },
      authUserId: ACTOR_ID,
    });

    const response = await callRoute({
      operationKey: "repair-1",
      items: [{ description: "Brake pads", qty: 1, unit_price: 80.001 }],
    });

    expect(response.status).toBe(400);
    expect(mocks.createAdminSupabase).not.toHaveBeenCalled();
  });

  it("surfaces durable total mismatches as conflicts", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "QUOTE_PRICING_REMEDIATION_TOTAL_MISMATCH" },
    }));
    mocks.requireShopScopedApiAccess.mockResolvedValue({
      ok: true,
      profile: { id: "profile-id", shop_id: SHOP_ID },
      authUserId: ACTOR_ID,
    });
    mocks.createAdminSupabase.mockReturnValue({ rpc });

    const response = await callRoute({
      operationKey: "repair-1",
      items: [{ description: "Brake pads", qty: 1, unit_price: 79 }],
    });

    expect(response.status).toBe(409);
  });
});
