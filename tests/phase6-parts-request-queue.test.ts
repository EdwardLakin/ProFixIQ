import { describe, expect, it } from "vitest";
import type { Database } from "@shared/types/types/supabase";
import {
  buildPartsRequestQueueModels,
  readPartsRequestIdFromRealtimePayload,
  reconcilePartsRequestQueueSnapshot,
  type PartsRequestQueueSnapshot,
} from "@/features/parts/lib/requests/parts-request-queue";

type PartRequest = Database["public"]["Tables"]["part_requests"]["Row"];
type PartRequestItem =
  Database["public"]["Tables"]["part_request_items"]["Row"];

const SHOP_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const WORK_ORDER_ID = "33333333-3333-4333-8333-333333333333";

function request(status: PartRequest["status"] = "requested"): PartRequest {
  return {
    id: REQUEST_ID,
    shop_id: SHOP_ID,
    work_order_id: WORK_ORDER_ID,
    status,
    created_at: "2026-08-22T12:00:00.000Z",
    source_menu_item_id: null,
  } as PartRequest;
}

function item(overrides: Partial<PartRequestItem> = {}): PartRequestItem {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    shop_id: SHOP_ID,
    request_id: REQUEST_ID,
    description: "Oil filter",
    qty: 1,
    qty_requested: 1,
    quoted_price: null,
    unit_price: null,
    status: "requested",
    updated_at: "2026-08-22T12:01:00.000Z",
    ...overrides,
  } as PartRequestItem;
}

function snapshot(
  overrides: Partial<PartsRequestQueueSnapshot> = {},
): PartsRequestQueueSnapshot {
  return {
    shopId: SHOP_ID,
    requests: [request()],
    items: [item()],
    workOrders: [
      {
        id: WORK_ORDER_ID,
        custom_id: "WO-000014",
        estimate_number: null,
        customers: null,
        vehicles: null,
      },
    ],
    menuItems: [],
    ...overrides,
  };
}

describe("Phase 6 Parts request queue contract", () => {
  it("keeps the known WO-000014 request and its direct-detail item count", () => {
    const queue = snapshot();
    const models = buildPartsRequestQueueModels(queue);

    expect(queue.workOrders).toContainEqual(
      expect.objectContaining({ custom_id: "WO-000014" }),
    );
    expect(models).toHaveLength(1);
    expect(models[0]?.request.id).toBe(REQUEST_ID);
    expect(models[0]?.items).toHaveLength(1);
    expect(models[0]?.stage).toBe("needs_quote");
  });

  it.each([
    {
      label: "quoted",
      status: "quoted" as const,
      row: item({ quoted_price: 25 }),
      expected: "awaiting_approval",
    },
    {
      label: "approved but not ordered",
      status: "approved" as const,
      row: item({ quoted_price: 25, qty_approved: 1 }),
      expected: "order_receive",
    },
    {
      label: "staged",
      status: "approved" as const,
      row: item({
        quoted_price: 25,
        qty_approved: 1,
        qty_reserved: 1,
      }),
      expected: "ready_for_tech",
    },
    {
      label: "fulfilled",
      status: "fulfilled" as const,
      row: item({ quoted_price: 25, qty_approved: 1, qty_consumed: 1 }),
      expected: "completed",
    },
  ])(
    "uses the canonical stage mapping for $label",
    ({ status, row, expected }) => {
      const [model] = buildPartsRequestQueueModels(
        snapshot({ requests: [request(status)], items: [row] }),
      );

      expect(model?.stage).toBe(expected);
    },
  );

  it("replaces one request by ID when duplicate realtime deliveries arrive", () => {
    const delta = snapshot({
      requests: [request("quoted")],
      items: [item({ quoted_price: 25 })],
    });

    const first = reconcilePartsRequestQueueSnapshot(
      snapshot(),
      delta,
      REQUEST_ID,
    );
    const second = reconcilePartsRequestQueueSnapshot(first, delta, REQUEST_ID);

    expect(second.requests).toHaveLength(1);
    expect(second.items).toHaveLength(1);
    expect(buildPartsRequestQueueModels(second)[0]?.stage).toBe(
      "awaiting_approval",
    );
  });

  it("removes a deleted request and reads request IDs from create/update/delete payloads", () => {
    const emptyDelta = snapshot({ requests: [], items: [], workOrders: [] });
    const next = reconcilePartsRequestQueueSnapshot(
      snapshot(),
      emptyDelta,
      REQUEST_ID,
    );

    expect(next.requests).toEqual([]);
    expect(next.items).toEqual([]);
    expect(
      readPartsRequestIdFromRealtimePayload(
        { new: { id: REQUEST_ID } },
        "request",
      ),
    ).toBe(REQUEST_ID);
    expect(
      readPartsRequestIdFromRealtimePayload(
        { old: { request_id: REQUEST_ID } },
        "item",
      ),
    ).toBe(REQUEST_ID);
    expect(
      readPartsRequestIdFromRealtimePayload({ old: {} }, "item"),
    ).toBeNull();
  });
});
