import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const route = fs.readFileSync(
  path.join(
    process.cwd(),
    "app/api/work-orders/[id]/quote-history-insights/route.ts",
  ),
  "utf8",
);

describe("quote history insights route", () => {
  it("requires quote authorization and scopes every history source to the actor shop", () => {
    expect(route).toContain('requiredCapability: "canAuthorizeQuotes"');
    expect(
      route.match(/\.eq\("shop_id", shopId\)/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(4);
    expect(route).toContain('.neq("id", workOrderId)');
    expect(route).toContain('.is("voided_at", null)');
  });

  it("gates candidates deterministically and validates AI-selected pairs", () => {
    expect(route).toContain("findRelevantHistoryCandidates");
    expect(route).toContain("!allowed.has(pair)");
    expect(route).toContain("fallbackSelections");
  });
});
