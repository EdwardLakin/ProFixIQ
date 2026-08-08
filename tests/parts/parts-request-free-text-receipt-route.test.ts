import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const PO_ID = "11111111-1111-4111-8111-111111111111";
const LINE_ID = "22222222-2222-4222-8222-222222222222";
const SHOP_ID = "33333333-3333-4333-8333-333333333333";
const RPC_NAME = "parts_receive_free_text_po_line";

const mocks = vi.hoisted(() => ({
  requireShopScopedApiAccess: vi.fn(),
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireShopScopedApiAccess,
}));

function request(body: Record<string, unknown>): Request {
  return new Request(
    `http://localhost/api/parts/purchase-orders/${PO_ID}/lines/${LINE_ID}/receive-free-text`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

async function callRoute(body: Record<string, unknown>) {
  const { POST } =
    await import("../../app/api/parts/purchase-orders/[poId]/lines/[lineId]/receive-free-text/route");
  return POST(request(body), {
    params: Promise.resolve({ poId: PO_ID, lineId: LINE_ID }),
  });
}

describe("request-backed free-text PO receipt route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires parts capability before invoking the receipt RPC", async () => {
    const rpc = vi.fn();
    mocks.requireShopScopedApiAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      supabase: { rpc },
    });

    const response = await callRoute({ qty: 1, idempotencyKey: "receipt-1" });

    expect(response.status).toBe(403);
    expect(mocks.requireShopScopedApiAccess).toHaveBeenCalledWith({
      requiredCapability: "canManageParts",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes quantity and a tenant-scoped stable key to the atomic RPC", async () => {
    const rpc = vi.fn(async () => ({
      data: { ok: true, line_received_qty: 1, request_received_qty: 1 },
      error: null,
    }));
    mocks.requireShopScopedApiAccess.mockResolvedValue({
      ok: true,
      profile: { id: "actor-id", shop_id: SHOP_ID },
      supabase: { rpc },
    });

    const response = await callRoute({ qty: 1, idempotencyKey: "receipt-1" });

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(RPC_NAME, {
      p_po_id: PO_ID,
      p_po_line_id: LINE_ID,
      p_qty: 1,
      p_idempotency_key: `${SHOP_ID}:${RPC_NAME}:receipt-1`,
    });
  });

  it("rejects receipt quantities beyond the request ledger precision", async () => {
    const rpc = vi.fn();
    mocks.requireShopScopedApiAccess.mockResolvedValue({
      ok: true,
      profile: { id: "actor-id", shop_id: SHOP_ID },
      supabase: { rpc },
    });

    const response = await callRoute({
      qty: 0.001,
      idempotencyKey: "over-precision",
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe(
      "Receipt quantity cannot use more than two decimal places.",
    );
    expect(mocks.requireShopScopedApiAccess).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns a stable conflict for a database-enforced cross-shop target", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "PARTS_PO_SHOP_MISMATCH" },
    }));
    mocks.requireShopScopedApiAccess.mockResolvedValue({
      ok: true,
      profile: { id: "actor-id", shop_id: SHOP_ID },
      supabase: { rpc },
    });

    const response = await callRoute({ qty: 1, idempotencyKey: "cross-shop" });
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toBe("PARTS_PO_SHOP_MISMATCH");
  });
});
