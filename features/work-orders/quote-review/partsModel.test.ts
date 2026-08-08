import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  resolveQuoteLineParts,
  quoteLineTotalResolved,
  type CatalogPart,
  type PartRequest,
  type PartRequestItem,
  type QuoteLine,
} from "./partsModel";
import type { Json } from "@shared/types/types/supabase";

const quoteLine = (
  metadata: Json | null = null,
): Pick<QuoteLine, "id" | "metadata"> => ({ id: "ql-1", metadata });

const liveItem = (
  overrides: Partial<PartRequestItem> = {},
): PartRequestItem => ({
  id: "pri-1",
  request_id: "pr-1",
  shop_id: "shop-1",
  source_row_id: null,
  source_menu_item_part_id: null,
  source_work_order_part_id: null,
  work_order_id: "wo-1",
  quote_line_id: "ql-1",
  description: "Brake fluid",
  qty: 1,
  qty_requested: 1,
  qty_approved: 0,
  qty_assigned: 0,
  qty_consumed: 0,
  qty_ordered: 0,
  qty_picked: 0,
  qty_received: 0,
  qty_reserved: 0,
  qty_returned: 0,
  approved: false,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  location_id: null,
  markup_pct: null,
  menu_item_id: null,
  part_id: null,
  po_id: null,
  quoted_price: null,
  requested_manufacturer: null,
  requested_part_number: null,
  status: "requested",
  supplier_quote_received_at: null,
  supplier_quote_requested_at: null,
  supplier_quote_status: "not_requested",
  latest_supplier_quote_request_id: null,
  unit_cost: null,
  unit_price: null,
  vendor: null,
  vendor_id: null,
  work_order_line_id: null,
  ...overrides,
});

const request = (overrides: Partial<PartRequest> = {}): PartRequest => ({
  id: "pr-1",
  shop_id: "shop-1",
  work_order_id: "wo-1",
  job_id: null,
  quote_line_id: "ql-1",
  requested_by: null,
  assigned_to: null,
  status: "requested",
  notes: null,
  created_at: "2026-01-01T00:00:00.000Z",
  handoff_completed_at: null,
  handoff_completed_by: null,
  source_context: null,
  source_menu_item_id: null,
  source_revision: null,
  ...overrides,
});

describe("Quote Review parts model", () => {
  it("renders live linked request item description and quantity", () => {
    const parts = resolveQuoteLineParts({
      line: quoteLine(),
      liveItems: [liveItem()],
    });
    expect(parts).toMatchObject([
      { description: "Brake fluid", quantity: 1, source: "live_request_item" },
    ]);
  });

  it("renders generic required part with null part_id and null price", () => {
    const parts = resolveQuoteLineParts({
      line: quoteLine(),
      liveItems: [
        liveItem({ part_id: null, unit_price: null, quoted_price: null }),
      ],
    });
    expect(parts[0]).toMatchObject({
      selectedPartId: null,
      pricingState: "unresolved",
    });
  });

  it("displays selected inventory identity separately from requested description", () => {
    const selected: CatalogPart = {
      id: "part-1",
      name: "Motorcraft BRF-1847",
      sku: "BRF-1847",
      part_number: "BRF1847",
      supplier: "Ford Dealer",
    };
    const parts = resolveQuoteLineParts({
      line: quoteLine(),
      liveItems: [
        liveItem({ description: "Front brake pads", part_id: "part-1" }),
      ],
      selectedParts: new Map([[selected.id, selected]]),
    });
    expect(parts[0]).toMatchObject({
      description: "Front brake pads",
      selectedPartName: "Motorcraft BRF-1847",
      selectedPartNumber: "BRF1847",
      supplier: "Ford Dealer",
    });
  });

  it("uses metadata.parts_quote.items when live item hydration is unavailable", () => {
    const parts = resolveQuoteLineParts({
      line: quoteLine({
        parts_quote: {
          items: [
            {
              id: "pri-1",
              request_id: "pr-1",
              description: "Brake fluid",
              qty: 1,
              status: "requested",
            },
          ],
        },
      }),
    });
    expect(parts).toMatchObject([
      {
        requestItemId: "pri-1",
        requestId: "pr-1",
        description: "Brake fluid",
        source: "synced_metadata",
      },
    ]);
  });

  it("uses metadata.parts as final technician-truth fallback", () => {
    const parts = resolveQuoteLineParts({
      line: quoteLine({ parts: [{ description: "Front brake pads", qty: 1 }] }),
    });
    expect(parts).toMatchObject([
      {
        description: "Front brake pads",
        quantity: 1,
        source: "technician_snapshot",
      },
    ]);
  });

  it("live request item takes precedence over metadata fallbacks", () => {
    const parts = resolveQuoteLineParts({
      line: quoteLine({
        parts_quote: {
          items: [
            { id: "pri-1", request_id: "pr-1", description: "Old", qty: 1 },
          ],
        },
        parts: [{ description: "Older", qty: 1 }],
      }),
      liveItems: [liveItem({ description: "Live" })],
    });
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({
      description: "Live",
      source: "live_request_item",
    });
  });

  it("uses the SQL-aligned greatest request quantity", () => {
    const parts = resolveQuoteLineParts({
      line: quoteLine(),
      liveItems: [
        liveItem({
          qty: 1,
          qty_requested: 3,
          qty_approved: 2,
          unit_price: 10,
        }),
      ],
    });

    expect(parts[0]).toMatchObject({
      quantity: 3,
      unitSellPrice: 10,
      sellLineTotal: 30,
    });
  });

  it("preserves a procured zero-margin acquisition cost", () => {
    const selected: CatalogPart = {
      id: "part-1",
      name: "Procured part",
      sku: "PROCURED-1",
      part_number: "PROCURED-1",
      supplier: "Supplier",
      cost: 40,
      default_cost: 35,
      price: 80,
      default_price: 75,
    };
    const [part] = resolveQuoteLineParts({
      line: quoteLine(),
      liveItems: [
        liveItem({
          part_id: selected.id,
          po_id: "po-1",
          qty_ordered: 1,
          unit_cost: 80,
          quoted_price: 80,
        }),
      ],
      selectedParts: new Map([[selected.id, selected]]),
    });

    expect(part).toMatchObject({
      unitCost: 80,
      unitSellPrice: 80,
      costLineTotal: 80,
      sellLineTotal: 80,
    });
  });

  it("still rejects an unprocured legacy sell mirror as acquisition cost", () => {
    const selected: CatalogPart = {
      id: "part-1",
      name: "Unprocured part",
      sku: "UNPROCURED-1",
      part_number: "UNPROCURED-1",
      supplier: "Supplier",
      cost: 40,
      default_cost: 35,
      price: 80,
      default_price: 75,
    };
    const [part] = resolveQuoteLineParts({
      line: quoteLine(),
      liveItems: [
        liveItem({
          part_id: selected.id,
          unit_cost: 80,
          quoted_price: 80,
        }),
      ],
      selectedParts: new Map([[selected.id, selected]]),
    });

    expect(part.unitCost).toBe(40);
  });

  it("does not let a canceled live batch override active synced metadata", () => {
    const parts = resolveQuoteLineParts({
      line: quoteLine({
        parts_quote: {
          items: [
            {
              id: "active-item",
              request_id: "active-request",
              description: "Active synced part",
              qty: 1,
              unit_price: 25,
              quote_ready: true,
            },
          ],
        },
      }),
      requests: [request({ status: "cancelled" })],
      liveItems: [liveItem({ description: "Canceled live part" })],
    });

    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({
      description: "Active synced part",
      source: "synced_metadata",
      unitSellPrice: 25,
    });
  });

  it("duplicate fallback representations produce one displayed part", () => {
    const parts = resolveQuoteLineParts({
      line: quoteLine({
        parts_quote: {
          items: [
            {
              id: "pri-1",
              request_id: "pr-1",
              description: "Brake fluid",
              qty: 1,
            },
            {
              id: "pri-1",
              request_id: "pr-1",
              description: "Brake fluid",
              qty: 1,
            },
          ],
        },
      }),
    });
    expect(parts).toHaveLength(1);
  });

  it("no-parts diagnosis resolves no required parts", () => {
    expect(resolveQuoteLineParts({ line: quoteLine({ parts: [] }) })).toEqual(
      [],
    );
  });

  it("does not create AI part fallback", () => {
    expect(
      resolveQuoteLineParts({
        line: quoteLine({
          ai_parts: [{ description: "AI part", qty: 1 }],
        } as Json),
      }),
    ).toEqual([]);
  });
});

describe("Quote Review total resolution", () => {
  it("one-hour line at $140 with persisted grand_total = 0 displays $140", () => {
    expect(
      quoteLineTotalResolved({
        persistedGrandTotal: 0,
        persistedSubtotal: null,
        calculatedLabor: 140,
        calculatedParts: 0,
      }),
    ).toBe(140);
  });

  it("1.5-hour line at $140 with persisted subtotal = 0 displays $210", () => {
    expect(
      quoteLineTotalResolved({
        persistedGrandTotal: null,
        persistedSubtotal: 0,
        calculatedLabor: 210,
        calculatedParts: 0,
      }),
    ).toBe(210);
  });

  it("truly zero labor/no-parts line stays $0", () => {
    expect(
      quoteLineTotalResolved({
        persistedGrandTotal: 0,
        persistedSubtotal: 0,
        calculatedLabor: 0,
        calculatedParts: 0,
      }),
    ).toBe(0);
  });

  it("quote totals include known labor while parts remain pending", () => {
    const totals = [140, 210, 140].reduce(
      (sum, labor) =>
        sum +
        quoteLineTotalResolved({
          persistedGrandTotal: 0,
          persistedSubtotal: 0,
          calculatedLabor: labor,
          calculatedParts: 0,
        }),
      0,
    );
    expect(totals).toBe(490);
  });
});

describe("QuoteReviewView linked parts queries and persistence boundaries", () => {
  const source = readFileSync(
    "features/work-orders/quote-review/QuoteReviewView.tsx",
    "utf8",
  );

  it("scopes linked parts queries by shop, work order, and quote line ids", () => {
    expect(source).toMatch(
      /from\("part_requests"\)[\s\S]*\.eq\("shop_id", shopId\)[\s\S]*\.eq\("work_order_id", woId\)[\s\S]*\.in\("quote_line_id", quoteLineIds\)/,
    );
    expect(source).toMatch(
      /from\("part_request_items"\)[\s\S]*\.eq\("shop_id", shopId\)[\s\S]*\.eq\("work_order_id", woId\)[\s\S]*\.in\("quote_line_id", quoteLineIds\)/,
    );
  });

  it("saving a quote line does not write part request data", () => {
    const saveBody = source.slice(
      source.indexOf("async function saveAllDirty"),
      source.indexOf("async function updateQuoteLineState"),
    );
    expect(saveBody).not.toContain("part_request_items");
    expect(saveBody).not.toContain("part_requests");
  });

  it("View Parts Request uses linked request_id", () => {
    expect(source).toContain("href={`/parts/requests/${request.id}`}");
  });

  it("renders quarantined pricing as manual review without a $0 or live-price claim", () => {
    expect(source).toContain("Manual pricing review required");
    expect(source).toContain(
      "Current Parts Request pricing is hidden because it is not the finalized customer decision.",
    );
    expect(source).toContain(
      'Finalized parts total is unavailable; do not treat it as $0.',
    );
    expect(source).toContain(
      "Current operational pricing hidden — it is not the finalized customer decision.",
    );
    expect(source).toContain('label: "Manual pricing review"');
    expect(source).toMatch(
      /function canSendLine[\s\S]*quoteLinePartsPricingSanitization\(line\)\.customerPricingQuarantined[\s\S]*return false/,
    );
    expect(source).toContain(
      'partsTotal == null ? "Manual review" : fmt(partsTotal)',
    );
    expect(source).toContain(
      'partsSummary.partsTotal == null ? "total pending" : fmt(partsSummary.partsTotal)',
    );
  });
});
