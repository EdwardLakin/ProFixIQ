import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@shared/types/types/supabase";

vi.mock("server-only", () => ({}));
vi.mock("@/features/parts/server/syncQuoteLinePartsStatus", () => ({
  syncQuoteLinePartsStatus: vi.fn(),
}));

import { createCanonicalQuoteLines } from "./canonicalQuoteLines";

type Row = Record<string, unknown>;

function clientThatFailsPartRequest() {
  const insertedQuoteRows: Row[] = [];

  const from = vi.fn((table: string) => {
    let operation: "select" | "insert" = "select";
    let inserted: Row | Row[] | null = null;
    const query: Record<string, ReturnType<typeof vi.fn>> = {};

    query.select = vi.fn(() => query);
    query.eq = vi.fn(() => query);
    query.in = vi.fn(() => query);
    query.contains = vi.fn(() => query);
    query.limit = vi.fn(() => query);
    query.insert = vi.fn((payload: Row | Row[]) => {
      operation = "insert";
      inserted = payload;
      if (table === "work_order_quote_lines") {
        insertedQuoteRows.push(...(Array.isArray(payload) ? payload : [payload]));
      }
      return query;
    });
    query.single = vi.fn(async () => {
      if (table === "part_requests" && operation === "insert") {
        return { data: null, error: { message: "forced part-request failure" } };
      }
      return { data: inserted, error: null };
    });
    query.then = vi.fn(
      (
        resolve: (value: { data: Row[]; error: null }) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => {
        const data =
          table === "work_order_quote_lines" && operation === "insert"
            ? insertedQuoteRows.map((_, index) => ({ id: `quote-${index + 1}` }))
            : [];
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    );
    return query;
  });

  return {
    supabase: { from } as unknown as SupabaseClient<Database>,
    insertedQuoteRows,
  };
}

describe("canonical quote initial commercial boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists the explicit $80 sell instead of caller-supplied $40 cost totals", async () => {
    const { supabase, insertedQuoteRows } = clientThatFailsPartRequest();

    const result = await createCanonicalQuoteLines({
      supabase,
      shopId: "shop-1",
      workOrderId: "work-order-1",
      items: [
        {
          description: "Sentinel repair",
          laborTotal: 150,
          taxTotal: 15,
          partsTotal: 40,
          subtotal: 190,
          grandTotal: 205,
          status: "quoted",
          stage: "ready_to_send",
          parts: [
            {
              description: "Sentinel part",
              qty: 1,
              unitCost: 40,
              unitPrice: 80,
            },
          ],
        },
      ],
    });

    expect(result).toEqual({ ok: false, error: "forced part-request failure" });
    expect(insertedQuoteRows).toHaveLength(1);
    expect(insertedQuoteRows[0]).toMatchObject({
      parts_total: 80,
      labor_total: 150,
      subtotal: 230,
      tax_total: 15,
      grand_total: 245,
      status: "pending_parts",
      stage: "advisor_pending",
    });
    expect(insertedQuoteRows[0].metadata).toMatchObject({
      parts: [
        {
          description: "Sentinel part",
          qty: 1,
          unitPrice: 80,
        },
      ],
    });
    expect(JSON.stringify(insertedQuoteRows[0].metadata)).not.toContain("unitCost");
  });

  it("leaves a cost-only partial failure pending with zero customer parts sell", async () => {
    const { supabase, insertedQuoteRows } = clientThatFailsPartRequest();

    const result = await createCanonicalQuoteLines({
      supabase,
      shopId: "shop-1",
      workOrderId: "work-order-1",
      items: [
        {
          description: "Cost-only repair",
          laborHours: 1,
          laborRate: 100,
          partsTotal: 40,
          subtotal: 140,
          grandTotal: 140,
          status: "quoted",
          stage: "ready_to_send",
          parts: [
            {
              description: "Unpriced part",
              qty: 1,
              unitCost: 40,
              unitPrice: null,
            },
          ],
        },
      ],
    });

    expect(result).toEqual({ ok: false, error: "forced part-request failure" });
    expect(insertedQuoteRows[0]).toMatchObject({
      parts_total: 0,
      labor_total: 100,
      subtotal: 100,
      grand_total: 100,
      status: "pending_parts",
      stage: "advisor_pending",
    });
    expect(insertedQuoteRows[0].metadata).toMatchObject({
      parts: [{ unitPrice: null }],
    });
    expect(JSON.stringify(insertedQuoteRows[0].metadata)).not.toContain("unitCost");
  });
});
