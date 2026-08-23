import { describe, expect, it } from "vitest";

import {
  canonicalQuotePartQuantity,
  readCanonicalQuotePartsSnapshot,
  resolveQuotePartsRequirement,
} from "./quote-parts-contract";

describe("canonical quoted-parts contract", () => {
  it("distinguishes explicit labor-only lines from unknown empty legacy lines", () => {
    expect(
      resolveQuotePartsRequirement({ metadata: { no_parts_required: true } }),
    ).toMatchObject({ state: "labor_only", displayCount: 0 });
    expect(resolveQuotePartsRequirement({ metadata: {} })).toMatchObject({
      state: "unknown",
      displayCount: 0,
    });
  });

  it("prefers canonical quote items over an empty technician snapshot", () => {
    const result = resolveQuotePartsRequirement({
      metadata: {
        parts: [],
        parts_quote: {
          required_count: 2,
          quoted_count: 2,
          pending_count: 0,
          parts_total: 64,
          items: [
            {
              id: "item-1",
              description: "Filter",
              qty: 2,
              unit_price: 12,
              line_total: 24,
              quote_ready: true,
            },
            {
              id: "item-2",
              description: "Oil",
              qty: 4,
              unit_price: 10,
              line_total: 40,
              quote_ready: true,
            },
          ],
        },
      },
    });

    expect(result).toMatchObject({ state: "required", displayCount: 2 });
    expect(result.snapshot.items.map((item) => item.quantity)).toEqual([2, 4]);
    expect(result.snapshot.partsTotal).toBe(64);
  });

  it("retains partial quote counts without calling the line labor-only", () => {
    const snapshot = readCanonicalQuotePartsSnapshot({
      parts_quote: {
        required_count: 2,
        quoted_count: 1,
        pending_count: 1,
        items: [
          {
            description: "Priced",
            qty: 1,
            unit_price: 20,
            line_total: 20,
            quote_ready: true,
          },
          {
            description: "Awaiting price",
            qty: 1,
            unit_price: null,
            line_total: null,
            quote_ready: false,
          },
        ],
      },
    });

    expect(snapshot).toMatchObject({
      requiredCount: 2,
      quotedCount: 1,
      pendingCount: 1,
      partsTotal: null,
    });
  });

  it("uses one maximum quantity rule for live, revision, Portal, and invoice shapes", () => {
    expect(
      canonicalQuotePartQuantity({
        qty: 1,
        quantity: 5,
        qty_requested: 4,
        qty_approved: 3,
      }),
    ).toBe(5);
  });
});
