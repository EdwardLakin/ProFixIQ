import { describe, expect, it } from "vitest";
import {
  quoteLinePartsDisplayTotal,
  quoteLinePartsPricingSanitization,
  resolveQuoteLineParts,
  type CatalogPart,
  type PartRequestItem,
  type QuoteLine,
} from "./partsModel";

const line: Pick<QuoteLine, "id" | "metadata"> = {
  id: "quote-line-1",
  metadata: null,
};

function requestItem(overrides: Partial<PartRequestItem> = {}): PartRequestItem {
  return {
    id: "request-item-1",
    request_id: "request-1",
    shop_id: "shop-1",
    source_row_id: null,
    source_menu_item_part_id: null,
    source_work_order_part_id: null,
    work_order_id: "work-order-1",
    quote_line_id: line.id,
    description: "Sentinel part",
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
    created_at: "2026-08-07T00:00:00.000Z",
    updated_at: "2026-08-07T00:00:00.000Z",
    location_id: null,
    markup_pct: null,
    menu_item_id: null,
    part_id: "catalog-part-1",
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
  };
}

function catalogPart(overrides: Partial<CatalogPart> = {}): CatalogPart {
  return {
    id: "catalog-part-1",
    name: "Sentinel catalog part",
    sku: "SENTINEL-1",
    part_number: "SENTINEL-1",
    supplier: "Sentinel Supplier",
    cost: null,
    default_cost: 40,
    price: 80,
    default_price: null,
    ...overrides,
  };
}

// @regression-flow quotes.review-cost-and-sell
describe("Quote Review cost and sell boundaries", () => {
  it("keeps the $40 acquisition cost separate from the explicit $80 customer sell", () => {
    const selected = catalogPart();
    const [part] = resolveQuoteLineParts({
      line,
      liveItems: [
        requestItem({
          unit_cost: 80,
          unit_price: 80,
        }),
      ],
      selectedParts: new Map([[selected.id, selected]]),
    });

    expect(part).toMatchObject({
      unitCost: 40,
      unitSellPrice: 80,
      costLineTotal: 40,
      sellLineTotal: 80,
      sellPriceIsSuggestion: false,
      pricingState: "priced",
    });
  });

  it("shows catalog sell as a suggestion without making the request quote-ready", () => {
    const selected = catalogPart();
    const [part] = resolveQuoteLineParts({
      line,
      liveItems: [requestItem({ unit_cost: 80 })],
      selectedParts: new Map([[selected.id, selected]]),
    });

    expect(part).toMatchObject({
      unitCost: 40,
      unitSellPrice: 80,
      sellPriceIsSuggestion: true,
      pricingState: "unresolved",
    });
  });

  it("keeps a cost-only request unresolved instead of treating cost as sell", () => {
    const selected = catalogPart({ price: null, default_price: null });
    const [part] = resolveQuoteLineParts({
      line,
      liveItems: [requestItem({ unit_cost: 40 })],
      selectedParts: new Map([[selected.id, selected]]),
    });

    expect(part).toMatchObject({
      unitCost: 40,
      unitSellPrice: null,
      costLineTotal: 40,
      sellLineTotal: null,
      pricingState: "unresolved",
    });
  });

  it("treats mirrored request cost as unknown when no catalog cost exists", () => {
    const [part] = resolveQuoteLineParts({
      line,
      liveItems: [
        requestItem({
          part_id: null,
          unit_cost: 80,
          unit_price: 80,
        }),
      ],
    });

    expect(part).toMatchObject({
      unitCost: null,
      unitSellPrice: 80,
      costLineTotal: null,
      sellLineTotal: 80,
      pricingState: "priced",
    });
  });

  it("prefers actual catalog cost $42 over fallback default_cost $40", () => {
    const selected = catalogPart({ cost: 42, default_cost: 40 });
    const [part] = resolveQuoteLineParts({
      line,
      liveItems: [requestItem({ unit_cost: 80, unit_price: 80 })],
      selectedParts: new Map([[selected.id, selected]]),
    });

    expect(part).toMatchObject({
      unitCost: 42,
      unitSellPrice: 80,
      costLineTotal: 42,
      sellLineTotal: 80,
    });
  });

  it("keeps negative explicit and catalog sell values unresolved", () => {
    const selected = catalogPart({ price: -5, default_price: 80 });
    const [part] = resolveQuoteLineParts({
      line,
      liveItems: [requestItem({ unit_cost: 40, quoted_price: -1, unit_price: 80 })],
      selectedParts: new Map([[selected.id, selected]]),
    });

    expect(part).toMatchObject({
      unitCost: 40,
      unitSellPrice: null,
      sellLineTotal: null,
      sellPriceIsSuggestion: false,
      pricingState: "unresolved",
    });
  });

  it("suppresses live $40/$80 operational pricing for a quarantined protected decision", () => {
    const quarantinedLine: Pick<QuoteLine, "id" | "metadata"> = {
      id: line.id,
      metadata: {
        parts_quote: {
          parts_total: null,
          pricing_sanitization: {
            manual_review_required: true,
            customer_pricing_quarantined: true,
          },
        },
      },
    };
    const [part] = resolveQuoteLineParts({
      line: quarantinedLine,
      liveItems: [requestItem({ unit_cost: 40, unit_price: 80 })],
      selectedParts: new Map([["catalog-part-1", catalogPart()]]),
    });

    expect(quoteLinePartsPricingSanitization(quarantinedLine)).toEqual({
      customerPricingQuarantined: true,
      manualReviewRequired: true,
    });
    expect(part).toMatchObject({
      source: "live_request_item",
      description: "Sentinel part",
      unitCost: null,
      unitSellPrice: null,
      costLineTotal: null,
      sellLineTotal: null,
      pricingState: "unresolved",
    });
  });

  it("uses the protected $40 decision total and never coerces an unavailable total to $0", () => {
    const metadata = {
      parts_quote: {
        parts_total: null,
        pricing_sanitization: {
          manual_review_required: true,
          customer_pricing_quarantined: true,
        },
      },
    };

    expect(
      quoteLinePartsDisplayTotal({
        line: { metadata, parts_total: 40 },
        fallbackPartsTotal: 80,
      }),
    ).toBe(40);
    expect(
      quoteLinePartsDisplayTotal({
        line: { metadata, parts_total: null },
        fallbackPartsTotal: 80,
      }),
    ).toBeNull();
  });
});
