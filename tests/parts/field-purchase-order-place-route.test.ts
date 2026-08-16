import { beforeEach, describe, expect, it, vi } from "vitest";

const PO_ID = "11111111-1111-4111-8111-111111111111";
const SHOP_ID = "22222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => ({
  requireShopScopedApiAccess: vi.fn(),
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireShopScopedApiAccess,
}));

function request(body: Record<string, unknown>): Request {
  return new Request(
    `http://localhost/api/parts/purchase-orders/${PO_ID}/place`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": "place-po-1",
      },
      body: JSON.stringify(body),
    },
  );
}

async function callRoute(body: Record<string, unknown>) {
  const { POST } =
    await import("../../app/api/parts/purchase-orders/[poId]/place/route");
  return POST(request(body), { params: Promise.resolve({ poId: PO_ID }) });
}

describe("Field purchase-order placement route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("places through the atomic lifecycle command with quote contact context", async () => {
    const rpc = vi.fn(async () => ({
      data: { ok: true, po_id: PO_ID, status: "open" },
      error: null,
    }));
    mocks.requireShopScopedApiAccess.mockResolvedValue({
      ok: true,
      profile: { shop_id: SHOP_ID },
      supabase: { rpc },
    });

    const response = await callRoute({ contactChannel: "email" });

    expect(response.status).toBe(200);
    expect(mocks.requireShopScopedApiAccess).toHaveBeenCalledWith({
      requiredCapability: "canManageParts",
    });
    expect(rpc).toHaveBeenCalledWith("parts_place_purchase_order", {
      p_po_id: PO_ID,
      p_idempotency_key: `${SHOP_ID}:parts_place_purchase_order:place-po-1`,
      p_contact_channel: "email",
    });
  });

  it("returns a retryable conflict when no active line can be placed", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: {
        code: "23514",
        message: "Add at least one active line before placing this PO.",
      },
    }));
    mocks.requireShopScopedApiAccess.mockResolvedValue({
      ok: true,
      profile: { shop_id: SHOP_ID },
      supabase: { rpc },
    });

    const response = await callRoute({ contactChannel: null });
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toMatchObject({
      ok: false,
      error: "Add at least one active line before placing this PO.",
    });
  });
});
