import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("owner report release gates", () => {
  it("keeps owner reports behind the shop-scoped financial access helper", () => {
    const route = source("app/api/reports/owner/route.ts");

    expect(route).toContain("requireShopScopedApiAccess");
    expect(route).toContain('requiredCapability: "canViewFinancials"');
    expect(route).toContain('allowRoles: ["owner", "admin", "manager"]');
    expect(route).toContain("supabase: access.supabase");
    expect(route).toContain("shopId: access.profile.shop_id");
    expect(route).not.toContain("searchParams.get(\"shopId\")");
  });

  it("translates legacy stats-summary timeRange bodies into the canonical report range", () => {
    const route = source("app/api/stats/summarize/route.ts");

    expect(route).toContain("LEGACY_RANGE_ALIASES");
    expect(route).toContain('["week", "weekly"]');
    expect(route).toContain('["month", "monthly"]');
    expect(route).toContain("body?.range) ?? normalizeRange(body?.timeRange)");
    expect(route).toContain("canonicalPost(canonicalRequest)");
    expect(route).not.toContain("chat.completions");
  });

  it("uses the canonical ready filter while preserving legacy deep links", () => {
    const reportBuilder = source(
      "features/owner/reports/server/buildOwnerIntelligenceReport.ts",
    );
    const filters = source("features/shared/lib/workboard/filters.ts");

    expect(reportBuilder).toContain('/work-orders/board?stage=ready');
    expect(filters).toContain('ready_to_invoice: "ready"');
  });
});
