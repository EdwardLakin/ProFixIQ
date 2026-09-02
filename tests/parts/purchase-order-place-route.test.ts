import { beforeEach, describe, expect, it, vi } from "vitest";

const PO_ID = "11111111-1111-4111-8111-111111111111";
const SHOP_ID = "22222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => ({
  requireCanonicalPartsApiAccess: vi.fn(),
  canAccessPartsPurchaseOrder: vi.fn(),
}));

vi.mock("@/features/parts/server/fieldPartsAuthorization", () => ({
  requireCanonicalPartsApiAccess: mocks.requireCanonicalPartsApiAccess,
  canAccessPartsPurchaseOrder: mocks.canAccessPartsPurchaseOrder,
}));

function createSupabase(options: {
  status: string;
  found?: boolean;
  lines?: Array<{ id: string; qty: number; cancelled_qty: number }>;
}) {
  const hasActiveLine = (
    options.lines ?? [{ id: "line-1", qty: 2, cancelled_qty: 0 }]
  ).some((line) => line.qty - line.cancelled_qty > 0);
  const rpc = vi.fn(async () => {
    if (options.found === false) {
      return {
        data: null,
        error: { code: "P0002", message: "Purchase order not found." },
      };
    }
    if (!hasActiveLine) {
      return {
        data: null,
        error: {
          code: "23514",
          message: "Add at least one active line before placing this PO.",
        },
      };
    }
    return {
      data: {
        idempotent: options.status !== "draft",
        po_id: PO_ID,
        status: "open",
      },
      error: null,
    };
  });

  return { rpc };
}

async function callRoute(supabase: ReturnType<typeof createSupabase>) {
  mocks.requireCanonicalPartsApiAccess.mockResolvedValue({
    ok: true,
    productScope: "shop",
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
    mocks.canAccessPartsPurchaseOrder.mockResolvedValue(true);
  });

  it("places a non-empty draft within the authorized shop scope", async () => {
    const supabase = createSupabase({ status: "draft" });
    const response = await callRoute(supabase);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      result: { idempotent: false, po_id: PO_ID, status: "open" },
    });
    expect(mocks.requireCanonicalPartsApiAccess).toHaveBeenCalledOnce();
    expect(supabase.rpc).toHaveBeenCalledWith("parts_place_purchase_order", {
      p_po_id: PO_ID,
      p_idempotency_key: `${SHOP_ID}:parts_place_purchase_order:place-po-1`,
      p_contact_channel: null,
    });
  });

  it("treats a retry against an already placed PO as idempotent", async () => {
    const supabase = createSupabase({ status: "open" });
    const response = await callRoute(supabase);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      result: { idempotent: true, po_id: PO_ID, status: "open" },
    });
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
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  it("does not expose a purchase order outside the authorized shop", async () => {
    const supabase = createSupabase({ status: "draft", found: false });
    const response = await callRoute(supabase);

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: "Purchase order not found.",
    });
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });
});
