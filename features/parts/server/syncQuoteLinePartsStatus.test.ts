import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("syncQuoteLinePartsStatus contract", () => {
  const source = readFileSync("features/parts/server/syncQuoteLinePartsStatus.ts", "utf8");

  it("keeps quote-line part item hydration scoped by shop, work order, and quote line", () => {
    expect(source).toMatch(/from\("part_request_items"\)[\s\S]*\.eq\("shop_id", shopId\)[\s\S]*\.eq\("work_order_id", line\.work_order_id\)[\s\S]*\.eq\("quote_line_id", quoteLineId\)/);
  });

  it("persists displayable parts_quote items without requiring inventory selection", () => {
    expect(source).toContain("required_count");
    expect(source).toContain("quoted_count");
    expect(source).toContain("pending_count");
    expect(source).toContain("description: item.description");
    expect(source).toContain("qty,");
    expect(source).toContain("part_id: item.part_id");
    expect(source).toContain("vendor: item.vendor");
  });
});
