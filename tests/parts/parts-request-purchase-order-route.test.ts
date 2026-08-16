import { beforeEach, describe, expect, it, vi } from "vitest";

const ITEM_ID = "11111111-1111-4111-8111-111111111111";
const SUPPLIER_ID = "22222222-2222-4222-8222-222222222222";
const SHOP_ID = "33333333-3333-4333-8333-333333333333";
const RPC_NAME = "parts_create_or_reuse_po_line_for_request";

const mocks = vi.hoisted(() => ({
  requireShopScopedApiAccess: vi.fn(),
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireShopScopedApiAccess,
}));

function createSupabase() {
  const filters: Array<[string, unknown]> = [];
  const itemQuery: {
    select: (columns: string) => typeof itemQuery;
    eq: (column: string, value: unknown) => typeof itemQuery;
    maybeSingle: () => Promise<{
      data: { id: string; part_id: null };
      error: null;
    }>;
  } = {
    select: vi.fn(() => itemQuery),
    eq: vi.fn((column: string, value: unknown) => {
      filters.push([column, value]);
      return itemQuery;
    }),
    maybeSingle: vi.fn(async () => ({
      data: { id: ITEM_ID, part_id: null },
      error: null,
    })),
  };
  const rpc = vi.fn(async () => ({
    data: { ok: true, po_id: "44444444-4444-4444-8444-444444444444" },
    error: null,
  }));
  const from = vi.fn((table: string) => {
    if (table !== "part_request_items") {
      throw new Error(`Unexpected table ${table}`);
    }
    return itemQuery;
  });
  return { filters, from, rpc };
}

function request(body: Record<string, unknown>): Request {
  return new Request(
    `http://localhost/api/parts/requests/items/${ITEM_ID}/po-line`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

async function callRoute(body: Record<string, unknown>) {
  const { POST } =
    await import("../../app/api/parts/requests/items/[itemId]/po-line/route");
  return POST(request(body), {
    params: Promise.resolve({ itemId: ITEM_ID }),
  });
}

describe("parts request purchase-order route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns stable 409 for a free-text item without acquisition cost and skips RPC", async () => {
    const supabase = createSupabase();
    mocks.requireShopScopedApiAccess.mockResolvedValue({
      ok: true,
      profile: { id: "actor-id", shop_id: SHOP_ID },
      supabase,
    });

    const response = await callRoute({
      supplierId: SUPPLIER_ID,
      qty: 1,
      idempotencyKey: "manual-no-cost",
    });
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toMatchObject({
      ok: false,
      code: "PARTS_ACQUISITION_COST_REQUIRED",
    });
    expect(supabase.filters).toEqual([
      ["id", ITEM_ID],
      ["shop_id", SHOP_ID],
    ]);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("passes explicit free-text acquisition cost through the scoped RPC", async () => {
    const supabase = createSupabase();
    mocks.requireShopScopedApiAccess.mockResolvedValue({
      ok: true,
      profile: { id: "actor-id", shop_id: SHOP_ID },
      supabase,
    });

    const response = await callRoute({
      supplierId: SUPPLIER_ID,
      qty: 1,
      unitCost: 40,
      idempotencyKey: "manual-cost-40",
    });

    expect(response.status).toBe(200);
    expect(mocks.requireShopScopedApiAccess).toHaveBeenCalledWith({
      requiredCapability: "canManageParts",
    });
    expect(supabase.filters).toEqual([
      ["id", ITEM_ID],
      ["shop_id", SHOP_ID],
    ]);
    expect(supabase.rpc).toHaveBeenCalledWith(
      RPC_NAME,
      expect.objectContaining({
        p_request_item_id: ITEM_ID,
        p_qty: 1,
        p_po_id: null,
        p_supplier_id: SUPPLIER_ID,
        p_unit_cost: 40,
        p_location_id: null,
        p_notes: null,
        p_idempotency_key: `${SHOP_ID}:${RPC_NAME}:manual-cost-40`,
      }),
    );
  });

  it("rejects order quantities with more than two decimal places", async () => {
    const supabase = createSupabase();
    mocks.requireShopScopedApiAccess.mockResolvedValue({
      ok: true,
      profile: { id: "actor-id", shop_id: SHOP_ID },
      supabase,
    });

    const response = await callRoute({
      supplierId: SUPPLIER_ID,
      qty: 1.001,
      unitCost: 40,
      idempotencyKey: "over-precision-order",
    });

    expect(response.status).toBe(400);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
