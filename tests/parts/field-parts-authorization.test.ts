import { beforeEach, describe, expect, it, vi } from "vitest";

const SHOP_ID = "11111111-1111-4111-8111-111111111111";
const PO_ID = "22222222-2222-4222-8222-222222222222";
const ITEM_ID = "33333333-3333-4333-8333-333333333333";
const WORK_ORDER_ID = "44444444-4444-4444-8444-444444444444";

const mocks = vi.hoisted(() => ({
  requireCanonicalShopOrFieldApiAccess: vi.fn(),
  canFieldActorAccessWorkOrder: vi.fn(),
}));

vi.mock("@/features/mobile/service/server/access", () => ({
  requireCanonicalShopOrFieldApiAccess:
    mocks.requireCanonicalShopOrFieldApiAccess,
  canFieldActorAccessWorkOrder: mocks.canFieldActorAccessWorkOrder,
}));

import {
  canAccessPartsPurchaseOrder,
  canAccessPartsRequestItem,
  requireCanonicalPartsApiAccess,
} from "@/features/parts/server/fieldPartsAuthorization";

function query(result: { data: unknown; error: { message: string } | null }) {
  const builder: Record<string, ReturnType<typeof vi.fn>> & {
    then?: Promise<unknown>["then"];
  } = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    maybeSingle: vi.fn(async () => result),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.in.mockReturnValue(builder);
  builder.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

function fieldAccess(from: ReturnType<typeof vi.fn>) {
  return {
    productScope: "field",
    profile: { id: "actor-id", shop_id: SHOP_ID, role: "parts" },
    supabase: { from },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.canFieldActorAccessWorkOrder.mockResolvedValue(true);
});

describe("canonical Field Parts authorization", () => {
  it("requires the canonical actor contract with Parts capability", async () => {
    mocks.requireCanonicalShopOrFieldApiAccess.mockResolvedValue({ ok: false });

    await requireCanonicalPartsApiAccess();

    expect(mocks.requireCanonicalShopOrFieldApiAccess).toHaveBeenCalledWith({
      requiredCapability: "canManageParts",
    });
  });

  it("limits a request item to its linked Field work order", async () => {
    const itemQuery = query({
      data: { work_order_id: WORK_ORDER_ID },
      error: null,
    });
    const from = vi.fn(() => itemQuery);
    const access = fieldAccess(from);

    await expect(
      canAccessPartsRequestItem(access as never, ITEM_ID),
    ).resolves.toBe(true);
    expect(itemQuery.eq).toHaveBeenCalledWith("shop_id", SHOP_ID);
    expect(mocks.canFieldActorAccessWorkOrder).toHaveBeenCalledWith(
      access,
      WORK_ORDER_ID,
    );
  });

  it("rejects a purchase order outside the actor's tenant before reading lines", async () => {
    const headerQuery = query({ data: null, error: null });
    const from = vi.fn(() => headerQuery);

    await expect(
      canAccessPartsPurchaseOrder(fieldAccess(from) as never, PO_ID),
    ).resolves.toBe(false);
    expect(headerQuery.eq).toHaveBeenCalledWith("shop_id", SHOP_ID);
    expect(from).toHaveBeenCalledTimes(1);
    expect(mocks.canFieldActorAccessWorkOrder).not.toHaveBeenCalled();
  });

  it("requires every PO line to resolve to an authorized linked request item", async () => {
    const headerQuery = query({ data: { id: PO_ID }, error: null });
    const lineQuery = query({
      data: [{ part_request_item_id: ITEM_ID }],
      error: null,
    });
    const itemQuery = query({
      data: [{ id: ITEM_ID, work_order_id: WORK_ORDER_ID }],
      error: null,
    });
    const from = vi
      .fn()
      .mockReturnValueOnce(headerQuery)
      .mockReturnValueOnce(lineQuery)
      .mockReturnValueOnce(itemQuery);
    const access = fieldAccess(from);

    await expect(
      canAccessPartsPurchaseOrder(access as never, PO_ID),
    ).resolves.toBe(true);
    expect(from).toHaveBeenNthCalledWith(1, "purchase_orders");
    expect(from).toHaveBeenNthCalledWith(2, "purchase_order_lines");
    expect(from).toHaveBeenNthCalledWith(3, "part_request_items");
    expect(itemQuery.eq).toHaveBeenCalledWith("shop_id", SHOP_ID);
    expect(mocks.canFieldActorAccessWorkOrder).toHaveBeenCalledWith(
      access,
      WORK_ORDER_ID,
    );
  });
});
