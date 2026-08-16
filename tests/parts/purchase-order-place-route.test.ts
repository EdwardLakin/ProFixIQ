import { beforeEach, describe, expect, it, vi } from "vitest";

const PO_ID = "11111111-1111-4111-8111-111111111111";
const SHOP_ID = "22222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => ({
  requireShopScopedApiAccess: vi.fn(),
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireShopScopedApiAccess,
}));

function createSupabase(options: {
  status: string;
  found?: boolean;
  lines?: Array<{ id: string; qty: number; cancelled_qty: number }>;
}) {
  const filters: Array<[string, unknown]> = [];
  const updates: Array<Record<string, unknown>> = [];
  const purchaseOrder = {
    id: PO_ID,
    status: options.status,
    ordered_at: options.status === "draft" ? null : "2026-08-16T12:00:00Z",
  };

  const purchaseOrderSelect = {
    eq(field: string, value: unknown) {
      filters.push([field, value]);
      return purchaseOrderSelect;
    },
    maybeSingle: vi.fn(async () => ({
      data: options.found === false ? null : purchaseOrder,
      error: null,
    })),
  };
  type PurchaseOrderUpdateChain = {
    eq: (field: string, value: unknown) => PurchaseOrderUpdateChain;
    select: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
  };
  const purchaseOrderUpdate: PurchaseOrderUpdateChain = {
    eq(field: string, value: unknown) {
      filters.push([field, value]);
      return purchaseOrderUpdate;
    },
    select: vi.fn(() => purchaseOrderUpdate),
    maybeSingle: vi.fn(async () => ({
      data: {
        ...purchaseOrder,
        status: "open",
        ordered_at: "2026-08-16T12:00:00Z",
      },
      error: null,
    })),
  };
  const lineSelect = {
    eq: vi.fn(async () => ({
      data: options.lines ?? [{ id: "line-1", qty: 2, cancelled_qty: 0 }],
      error: null,
    })),
  };

  return {
    filters,
    updates,
    from: vi.fn((table: string) => {
      if (table === "purchase_order_lines") {
        return { select: vi.fn(() => lineSelect) };
      }
      if (table === "purchase_orders") {
        return {
          select: vi.fn(() => purchaseOrderSelect),
          update: vi.fn((payload: Record<string, unknown>) => {
            updates.push(payload);
            return purchaseOrderUpdate;
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

async function callRoute(supabase: ReturnType<typeof createSupabase>) {
  mocks.requireShopScopedApiAccess.mockResolvedValue({
    ok: true,
    profile: { id: "actor-1", shop_id: SHOP_ID },
    supabase,
  });
  const { POST } =
    await import("../../app/api/parts/purchase-orders/[poId]/place/route");
  return POST(
    new Request(`http://localhost/api/parts/purchase-orders/${PO_ID}/place`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "place-po-1",
      },
      body: JSON.stringify({ idempotencyKey: "place-po-1" }),
    }),
    { params: Promise.resolve({ poId: PO_ID }) },
  );
}

describe("purchase-order place route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("places a non-empty draft within the authorized shop scope", async () => {
    const supabase = createSupabase({ status: "draft" });
    const response = await callRoute(supabase);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, idempotent: false });
    expect(mocks.requireShopScopedApiAccess).toHaveBeenCalledWith({
      requiredCapability: "canManageParts",
    });
    expect(supabase.updates).toEqual([
      expect.objectContaining({ status: "open" }),
    ]);
    expect(supabase.filters).toEqual(
      expect.arrayContaining([
        ["id", PO_ID],
        ["shop_id", SHOP_ID],
        ["status", "draft"],
      ]),
    );
  });

  it("treats a retry against an already placed PO as idempotent", async () => {
    const supabase = createSupabase({ status: "open" });
    const response = await callRoute(supabase);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, idempotent: true });
    expect(supabase.updates).toHaveLength(0);
  });

  it("refuses to place a header without an active line", async () => {
    const supabase = createSupabase({
      status: "draft",
      lines: [{ id: "line-1", qty: 2, cancelled_qty: 2 }],
    });
    const response = await callRoute(supabase);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: expect.stringContaining("active line"),
    });
    expect(supabase.updates).toHaveLength(0);
  });

  it("does not expose a purchase order outside the authorized shop", async () => {
    const supabase = createSupabase({ status: "draft", found: false });
    const response = await callRoute(supabase);

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: "Purchase order not found.",
    });
    expect(supabase.filters).toEqual(
      expect.arrayContaining([
        ["id", PO_ID],
        ["shop_id", SHOP_ID],
      ]),
    );
    expect(supabase.updates).toHaveLength(0);
  });
});
