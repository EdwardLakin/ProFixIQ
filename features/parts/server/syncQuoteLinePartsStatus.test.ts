import { describe, expect, it, vi } from "vitest";
import { syncQuoteLinePartsStatus } from "./syncQuoteLinePartsStatus";

describe("syncQuoteLinePartsStatus contract", () => {
  it("delegates to the canonical RPC with shop and quote-line scope", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });

    await syncQuoteLinePartsStatus(
      { rpc } as unknown as Parameters<typeof syncQuoteLinePartsStatus>[0],
      { shopId: " shop-1 ", quoteLineId: " ql-1 " },
    );

    expect(rpc).toHaveBeenCalledWith("sync_quote_line_pricing_from_parts", {
      p_shop_id: "shop-1",
      p_quote_line_id: "ql-1",
    });
  });

  it("maps the canonical RPC result for Quote Review consumers", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ok: true,
        quoteLineId: "ql-1",
        shopId: "shop-1",
        requestId: "pr-1",
        itemCount: 2,
        quotedCount: 1,
        pendingCount: 1,
        partsTotal: 45.5,
        laborRate: 140,
        laborTotal: 210,
        status: "pending_parts",
        stage: "advisor_pending",
      },
      error: null,
    });

    await expect(
      syncQuoteLinePartsStatus(
        { rpc } as unknown as Parameters<typeof syncQuoteLinePartsStatus>[0],
        { shopId: "shop-1", quoteLineId: "ql-1" },
      ),
    ).resolves.toEqual({
      ok: true,
      quoteLineId: "ql-1",
      shopId: "shop-1",
      requestId: "pr-1",
      itemCount: 2,
      quotedCount: 1,
      pendingCount: 1,
      partsTotal: 45.5,
      laborRate: 140,
      laborTotal: 210,
      status: "pending_parts",
      stage: "advisor_pending",
      skipped: undefined,
      error: undefined,
    });
  });

  it("returns a scoped validation error before calling the RPC", async () => {
    const rpc = vi.fn();

    await expect(
      syncQuoteLinePartsStatus(
        { rpc } as unknown as Parameters<typeof syncQuoteLinePartsStatus>[0],
        { shopId: "", quoteLineId: "ql-1" },
      ),
    ).resolves.toMatchObject({
      ok: false,
      quoteLineId: "ql-1",
      shopId: "",
      error: "shopId and quoteLineId are required",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
