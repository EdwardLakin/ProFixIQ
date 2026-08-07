import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import {
  isQuoteCustomerPricingQuarantined,
  isQuotePricingQuarantineError,
  QUOTE_PRICING_QUARANTINED_MESSAGE,
} from "@/features/work-orders/lib/quotes/quotePricingQuarantine";
import { checkQuotePricingQuarantine } from "@/features/work-orders/server/quotePricingQuarantine";
import { applyWorkOrderQuoteLineDecision } from "@/features/work-orders/server/workOrderQuoteLineApproval";

type QueryResult = {
  data: unknown[] | null;
  error: { message: string } | null;
};

function query(result: QueryResult) {
  const builder: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    in: ReturnType<typeof vi.fn>;
    then: PromiseLike<QueryResult>["then"];
  } = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.in.mockReturnValue(builder);
  return builder;
}

function client(input: {
  quoteLines?: unknown[];
  workOrderLines?: unknown[];
  rpcData?: unknown;
}) {
  const quoteQuery = query({ data: input.quoteLines ?? [], error: null });
  const workOrderQuery = query({
    data: input.workOrderLines ?? [],
    error: null,
  });
  const rpc = vi.fn(async () => ({
    data: input.rpcData ?? { ok: true },
    error: null,
  }));
  const from = vi.fn((table: string) => {
    if (table === "work_order_quote_lines") return quoteQuery;
    if (table === "work_order_lines") return workOrderQuery;
    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    supabase: { from, rpc } as unknown as SupabaseClient<Database>,
    from,
    quoteQuery,
    workOrderQuery,
    rpc,
  };
}

const quarantinedMetadata = {
  parts_quote: {
    pricing_sanitization: {
      customer_pricing_quarantined: true,
      manual_review_required: true,
    },
  },
};

describe("quote pricing quarantine server guard", () => {
  it("recognizes only the explicit nested quarantine flag", () => {
    expect(isQuoteCustomerPricingQuarantined(quarantinedMetadata)).toBe(true);
    expect(
      isQuoteCustomerPricingQuarantined({
        pricing_sanitization: { customer_pricing_quarantined: true },
      }),
    ).toBe(false);
    expect(
      isQuoteCustomerPricingQuarantined({
        parts_quote: {
          pricing_sanitization: { customer_pricing_quarantined: "true" },
        },
      }),
    ).toBe(false);
    expect(isQuoteCustomerPricingQuarantined(null)).toBe(false);
    expect(isQuotePricingQuarantineError("QUOTE_PRICING_QUARANTINED"))
      .toBe(true);
    expect(isQuotePricingQuarantineError("requires pricing quarantine"))
      .toBe(true);
    expect(isQuotePricingQuarantineError("unrelated conflict")).toBe(false);
  });

  it("blocks direct quote ids and preserves shop/work-order query scope", async () => {
    const mock = client({
      quoteLines: [
        {
          id: "quote-1",
          work_order_line_id: null,
          source_work_order_line_id: null,
          status: "quoted",
          metadata: quarantinedMetadata,
        },
      ],
    });

    const result = await checkQuotePricingQuarantine({
      supabase: mock.supabase,
      shopId: "shop-a",
      workOrderId: "work-order-a",
      quoteLineIds: ["quote-1"],
    });

    expect(result).toEqual({
      ok: false,
      reason: "quarantined",
      error: QUOTE_PRICING_QUARANTINED_MESSAGE,
      quoteLineIds: ["quote-1"],
    });
    expect(mock.quoteQuery.eq).toHaveBeenCalledWith("shop_id", "shop-a");
    expect(mock.quoteQuery.eq).toHaveBeenCalledWith(
      "work_order_id",
      "work-order-a",
    );
  });

  it("blocks materialized work-order-line aliases and sent bulk remainders", async () => {
    const mock = client({
      quoteLines: [
        {
          id: "quote-pointer",
          work_order_line_id: "line-pointer",
          source_work_order_line_id: null,
          status: "converted",
          metadata: quarantinedMetadata,
        },
        {
          id: "quote-source",
          work_order_line_id: null,
          source_work_order_line_id: "line-origin",
          status: "sent",
          metadata: quarantinedMetadata,
        },
      ],
      workOrderLines: [
        {
          id: "line-source",
          source_row_id: "quote-source",
          external_id: null,
        },
      ],
    });

    const pointerResult = await checkQuotePricingQuarantine({
      supabase: mock.supabase,
      shopId: "shop-a",
      workOrderId: "work-order-a",
      workOrderLineIds: ["line-pointer"],
    });
    expect(pointerResult.ok).toBe(false);

    const originResult = await checkQuotePricingQuarantine({
      supabase: mock.supabase,
      shopId: "shop-a",
      workOrderId: "work-order-a",
      workOrderLineIds: ["line-origin"],
    });
    expect(originResult.ok).toBe(false);

    const sourceResult = await checkQuotePricingQuarantine({
      supabase: mock.supabase,
      shopId: "shop-a",
      workOrderId: "work-order-a",
      workOrderLineIds: ["line-source"],
    });
    expect(sourceResult.ok).toBe(false);

    const remainingResult = await checkQuotePricingQuarantine({
      supabase: mock.supabase,
      shopId: "shop-a",
      workOrderId: "work-order-a",
      quoteLineIds: [],
      includeSentRemaining: true,
    });
    expect(remainingResult).toMatchObject({
      ok: false,
      reason: "quarantined",
      quoteLineIds: ["quote-source"],
    });
  });

  it("never calls a decision RPC for quarantined pricing", async () => {
    const mock = client({
      quoteLines: [
        {
          id: "quote-1",
          work_order_line_id: null,
          source_work_order_line_id: null,
          status: "quoted",
          metadata: quarantinedMetadata,
        },
      ],
    });

    const result = await applyWorkOrderQuoteLineDecision({
      supabase: mock.supabase,
      quoteLineIds: ["quote-1"],
      workOrderId: "work-order-a",
      shopId: "shop-a",
      customerId: "customer-a",
      actorUserId: "actor-a",
      decision: "approve",
      operationKey: "stable-key",
    });

    expect(result).toMatchObject({
      ok: false,
      pricingQuarantined: true,
      error: QUOTE_PRICING_QUARANTINED_MESSAGE,
    });
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("keeps the canonical atomic RPC for clean pricing", async () => {
    const mock = client({
      quoteLines: [
        {
          id: "quote-clean",
          work_order_line_id: null,
          source_work_order_line_id: null,
          status: "sent",
          metadata: {},
        },
      ],
    });

    const result = await applyWorkOrderQuoteLineDecision({
      supabase: mock.supabase,
      quoteLineIds: ["quote-clean"],
      workOrderId: "work-order-a",
      shopId: "shop-a",
      customerId: "customer-a",
      actorUserId: "actor-a",
      decision: "approve",
      operationKey: "stable-key",
    });

    expect(result.ok).toBe(true);
    expect(mock.rpc).toHaveBeenCalledTimes(1);
    expect(mock.rpc).toHaveBeenCalledWith(
      "apply_portal_quote_decision_atomic",
      expect.objectContaining({ p_quote_line_ids: ["quote-clean"] }),
    );
  });
});
