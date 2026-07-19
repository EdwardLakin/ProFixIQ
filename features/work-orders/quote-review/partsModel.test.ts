import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolveQuoteLineParts, quoteLineTotalResolved, type CatalogPart, type PartRequestItem, type QuoteLine } from "./partsModel";
import type { Json } from "@shared/types/types/supabase";

const quoteLine = (metadata: Json | null = null): Pick<QuoteLine, "id" | "metadata"> => ({ id: "ql-1", metadata });

const liveItem = (overrides: Partial<PartRequestItem> = {}): PartRequestItem => ({
  id: "pri-1",
  request_id: "pr-1",
  shop_id: "shop-1",
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
  unit_cost: null,
  unit_price: null,
  vendor: null,
  vendor_id: null,
  work_order_line_id: null,
  ...overrides,
});

describe("Quote Review parts model", () => {
  it("renders live linked request item description and quantity", () => {
    const parts = resolveQuoteLineParts({ line: quoteLine(), liveItems: [liveItem()] });
    expect(parts).toMatchObject([{ description: "Brake fluid", quantity: 1, source: "live_request_item" }]);
  });

  it("renders generic required part with null part_id and null price", () => {
    const parts = resolveQuoteLineParts({ line: quoteLine(), liveItems: [liveItem({ part_id: null, unit_price: null, quoted_price: null })] });
    expect(parts[0]).toMatchObject({ selectedPartId: null, pricingState: "unresolved" });
  });

  it("displays selected inventory identity separately from requested description", () => {
    const selected: CatalogPart = { id: "part-1", name: "Motorcraft BRF-1847", sku: "BRF-1847", part_number: "BRF1847", supplier: "Ford Dealer" };
    const parts = resolveQuoteLineParts({
      line: quoteLine(),
      liveItems: [liveItem({ description: "Front brake pads", part_id: "part-1" })],
      selectedParts: new Map([[selected.id, selected]]),
    });
    expect(parts[0]).toMatchObject({ description: "Front brake pads", selectedPartName: "Motorcraft BRF-1847", selectedPartNumber: "BRF1847", supplier: "Ford Dealer" });
  });

  it("uses metadata.parts_quote.items when live item hydration is unavailable", () => {
    const parts = resolveQuoteLineParts({ line: quoteLine({ parts_quote: { items: [{ id: "pri-1", request_id: "pr-1", description: "Brake fluid", qty: 1, status: "requested" }] } }) });
    expect(parts).toMatchObject([{ requestItemId: "pri-1", requestId: "pr-1", description: "Brake fluid", source: "synced_metadata" }]);
  });

  it("uses metadata.parts as final technician-truth fallback", () => {
    const parts = resolveQuoteLineParts({ line: quoteLine({ parts: [{ description: "Front brake pads", qty: 1 }] }) });
    expect(parts).toMatchObject([{ description: "Front brake pads", quantity: 1, source: "technician_snapshot" }]);
  });

  it("live request item takes precedence over metadata fallbacks", () => {
    const parts = resolveQuoteLineParts({
      line: quoteLine({ parts_quote: { items: [{ id: "pri-1", request_id: "pr-1", description: "Old", qty: 1 }] }, parts: [{ description: "Older", qty: 1 }] }),
      liveItems: [liveItem({ description: "Live" })],
    });
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ description: "Live", source: "live_request_item" });
  });

  it("duplicate fallback representations produce one displayed part", () => {
    const parts = resolveQuoteLineParts({ line: quoteLine({ parts_quote: { items: [
      { id: "pri-1", request_id: "pr-1", description: "Brake fluid", qty: 1 },
      { id: "pri-1", request_id: "pr-1", description: "Brake fluid", qty: 1 },
    ] } }) });
    expect(parts).toHaveLength(1);
  });

  it("no-parts diagnosis resolves no required parts", () => {
    expect(resolveQuoteLineParts({ line: quoteLine({ parts: [] }) })).toEqual([]);
  });

  it("does not create AI part fallback", () => {
    expect(resolveQuoteLineParts({ line: quoteLine({ ai_parts: [{ description: "AI part", qty: 1 }] } as Json) })).toEqual([]);
  });
});

describe("Quote Review total resolution", () => {
  it("one-hour line at $140 with persisted grand_total = 0 displays $140", () => {
    expect(quoteLineTotalResolved({ persistedGrandTotal: 0, persistedSubtotal: null, calculatedLabor: 140, calculatedParts: 0 })).toBe(140);
  });

  it("1.5-hour line at $140 with persisted subtotal = 0 displays $210", () => {
    expect(quoteLineTotalResolved({ persistedGrandTotal: null, persistedSubtotal: 0, calculatedLabor: 210, calculatedParts: 0 })).toBe(210);
  });

  it("truly zero labor/no-parts line stays $0", () => {
    expect(quoteLineTotalResolved({ persistedGrandTotal: 0, persistedSubtotal: 0, calculatedLabor: 0, calculatedParts: 0 })).toBe(0);
  });

  it("quote totals include known labor while parts remain pending", () => {
    const totals = [140, 210, 140].reduce((sum, labor) => sum + quoteLineTotalResolved({ persistedGrandTotal: 0, persistedSubtotal: 0, calculatedLabor: labor, calculatedParts: 0 }), 0);
    expect(totals).toBe(490);
  });
});

describe("QuoteReviewView linked parts queries and persistence boundaries", () => {
  const source = readFileSync("features/work-orders/quote-review/QuoteReviewView.tsx", "utf8");

  it("scopes linked parts queries by shop, work order, and quote line ids", () => {
    expect(source).toMatch(/from\("part_requests"\)[\s\S]*\.eq\("shop_id", shopId\)[\s\S]*\.eq\("work_order_id", woId\)[\s\S]*\.in\("quote_line_id", quoteLineIds\)/);
    expect(source).toMatch(/from\("part_request_items"\)[\s\S]*\.eq\("shop_id", shopId\)[\s\S]*\.eq\("work_order_id", woId\)[\s\S]*\.in\("quote_line_id", quoteLineIds\)/);
  });

  it("saving a quote line does not write part request data", () => {
    const saveBody = source.slice(source.indexOf("async function saveAllDirty"), source.indexOf("async function updateQuoteLineState"));
    expect(saveBody).not.toContain("part_request_items");
    expect(saveBody).not.toContain("part_requests");
  });

  it("View Parts Request uses linked request_id", () => {
    expect(source).toContain("href={`/parts/requests/${request.id}`}");
  });
});
