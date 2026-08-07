import { describe, expect, it, vi } from "vitest";
import {
  buildReusePartRequestItems,
  customerVisibleReuseParts,
  persistReusePartRequest,
  type ReusePartPersistenceInput,
} from "./reusePartPersistence";
import {
  resolveQuoteLineParts,
  type PartRequestItem,
  type QuoteLine,
} from "@/features/work-orders/quote-review/partsModel";

const snapshotPart: ReusePartPersistenceInput = {
  description: "Snapshot sentinel part",
  partNumber: "SENTINEL-1",
  supplierPartNumber: "SUP-1",
  qty: 1,
  unitCost: 40,
  unitPrice: 80,
  availability: "available",
  leadTime: null,
  notes: null,
  source: "pricing_snapshot",
  sourcePricingPartId: "snapshot-part-1",
  sourceMenuRepairItemPartId: "menu-part-1",
};

function hydratedRequestItem(
  persisted: ReturnType<typeof buildReusePartRequestItems>[number],
): PartRequestItem {
  return {
    id: "request-item-1",
    request_id: String(persisted.request_id),
    shop_id: persisted.shop_id ?? null,
    work_order_id: persisted.work_order_id ?? null,
    quote_line_id: persisted.quote_line_id ?? null,
    work_order_line_id: persisted.work_order_line_id ?? null,
    source_row_id: persisted.source_row_id ?? null,
    source_menu_item_part_id: persisted.source_menu_item_part_id ?? null,
    source_work_order_part_id: null,
    description: persisted.description,
    qty: persisted.qty ?? 1,
    qty_requested: persisted.qty_requested ?? 0,
    qty_approved: 0,
    qty_assigned: 0,
    qty_consumed: 0,
    qty_ordered: 0,
    qty_picked: 0,
    qty_received: 0,
    qty_reserved: 0,
    qty_returned: 0,
    approved: false,
    created_at: "2026-08-07T00:00:00.000Z",
    updated_at: "2026-08-07T00:00:00.000Z",
    location_id: null,
    markup_pct: null,
    menu_item_id: null,
    part_id: null,
    po_id: null,
    quoted_price: persisted.quoted_price ?? null,
    requested_manufacturer: null,
    requested_part_number: null,
    status: persisted.status ?? "requested",
    unit_cost: persisted.unit_cost ?? null,
    unit_price: persisted.unit_price ?? null,
    vendor: null,
    vendor_id: null,
  };
}

function persist(includeExplicitSell: boolean) {
  return buildReusePartRequestItems({
    requestId: "request-1",
    shopId: "shop-1",
    workOrderId: "work-order-1",
    quoteLineId: "quote-line-1",
    parts: [snapshotPart],
    includeExplicitSell,
  });
}

function persistenceClient(options?: { itemError?: string }) {
  const inserted: Array<{ table: string; value: unknown }> = [];
  const deleted: string[] = [];
  const client = {
    from(table: string) {
      if (table === "part_requests") {
        return {
          insert(value: unknown) {
            inserted.push({ table, value });
            return {
              select() {
                return {
                  async single() {
                    return { data: { id: "request-1" }, error: null };
                  },
                };
              },
            };
          },
          delete() {
            return {
              eq() {
                return {
                  async eq() {
                    deleted.push("request-1");
                    return { error: null };
                  },
                };
              },
            };
          },
        };
      }
      if (table === "part_request_items") {
        return {
          async insert(value: unknown) {
            inserted.push({ table, value });
            return {
              error: options?.itemError ? { message: options.itemError } : null,
            };
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  } as unknown as Parameters<typeof persistReusePartRequest>[0];
  return { client, inserted, deleted };
}

function successfulSync() {
  return {
    ok: true,
    quoteLineId: "quote-line-1",
    shopId: "shop-1",
    requestId: "request-1",
    itemCount: 1,
    quotedCount: 1,
    pendingCount: 0,
    partsTotal: 80,
    laborRate: 0,
    laborTotal: 0,
    status: "quoted",
    stage: "ready_to_send",
  };
}

describe("menu-repair reuse private pricing persistence", () => {
  it("hydrates fresh snapshot cost $40 and explicit sell $80 without metadata cost", () => {
    const [persisted] = persist(true);
    const customerParts = customerVisibleReuseParts([snapshotPart], true);
    const line: Pick<QuoteLine, "id" | "metadata"> = {
      id: "quote-line-1",
      metadata: { parts: customerParts },
    };

    expect(persisted).toMatchObject({
      source_row_id: "snapshot-part-1",
      source_menu_item_part_id: null,
      unit_cost: 40,
      unit_price: 80,
      quoted_price: null,
    });
    expect(customerParts).toMatchObject([{ unitPrice: 80 }]);
    expect(JSON.stringify(customerParts)).not.toMatch(/unitCost|unit_cost|"cost"/);
    expect(
      resolveQuoteLineParts({ line, liveItems: [hydratedRequestItem(persisted)] })[0],
    ).toMatchObject({
      unitCost: 40,
      unitSellPrice: 80,
      pricingState: "priced",
    });
  });

  it("keeps stale snapshot sell non-explicit while preserving private cost and source", () => {
    const [persisted] = persist(false);
    const customerParts = customerVisibleReuseParts([snapshotPart], false);
    const line: Pick<QuoteLine, "id" | "metadata"> = {
      id: "quote-line-1",
      metadata: { parts: customerParts },
    };

    expect(persisted).toMatchObject({
      source_row_id: "snapshot-part-1",
      unit_cost: 40,
      unit_price: null,
      quoted_price: null,
    });
    expect(customerParts).toMatchObject([{ unitPrice: null }]);
    expect(JSON.stringify(customerParts)).not.toMatch(/unitCost|unit_cost|"cost"/);
    expect(
      resolveQuoteLineParts({ line, liveItems: [hydratedRequestItem(persisted)] })[0],
    ).toMatchObject({
      unitCost: 40,
      unitSellPrice: null,
      pricingState: "unresolved",
    });
  });

  it("persists the canonical request and returns the database-synced fresh quote state", async () => {
    const { client, inserted } = persistenceClient();
    const sync = vi.fn(async () => successfulSync());

    const result = await persistReusePartRequest(
      client,
      {
        shopId: "shop-1",
        workOrderId: "work-order-1",
        quoteLineId: "quote-line-1",
        requestedBy: "user-1",
        notes: null,
        parts: [snapshotPart],
        includeExplicitSell: true,
      },
      sync,
    );

    expect(sync).toHaveBeenCalledWith(client, {
      shopId: "shop-1",
      quoteLineId: "quote-line-1",
    });
    expect(result).toMatchObject({
      created: true,
      requestId: "request-1",
      sync: { status: "quoted", pendingCount: 0, partsTotal: 80 },
    });
    expect(inserted.find((entry) => entry.table === "part_request_items")?.value).toMatchObject([
      {
        source_row_id: "snapshot-part-1",
        source_menu_item_part_id: null,
        unit_cost: 40,
        unit_price: 80,
      },
    ]);
  });

  it("compensates the private request when canonical pricing sync fails", async () => {
    const { client, deleted } = persistenceClient();
    const sync = vi.fn(async () => ({
      ...successfulSync(),
      ok: false,
      status: "",
      stage: null,
      error: "sync failed",
    }));

    const result = await persistReusePartRequest(
      client,
      {
        shopId: "shop-1",
        workOrderId: "work-order-1",
        quoteLineId: "quote-line-1",
        requestedBy: "user-1",
        notes: null,
        parts: [snapshotPart],
        includeExplicitSell: true,
      },
      sync,
    );

    expect(result).toMatchObject({ created: false, requestId: "request-1", error: "sync failed" });
    expect(deleted).toEqual(["request-1"]);
  });
});
