import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("deferred-work shared application contracts", () => {
  it("keeps deferred technical context out of workforce active/unassigned counts", () => {
    const route = read("app/api/workforce/overview/route.ts");
    const excludedBlock = route.match(/const ACTIVE_LINE_EXCLUDED = \[[\s\S]*?\];/)?.[0] ?? "";

    expect(excludedBlock).toContain('"deferred"');
    expect(route).toContain("ACTIVE_LINE_EXCLUDED.includes");
  });

  it("keeps deferred technical context out of invoice completion review", () => {
    const review = read("app/api/work-orders/[id]/_lib/reviewWorkOrder.ts");

    expect(review).toContain("function isDeferredHistoryLine");
    expect(review).toContain("!isDeferredHistoryLine(record)");
    expect(review).toContain("deferredHistoryLineIds");
    expect(review).toContain("invoicePartIssues.filter");
  });

  it("runs deferred runtime coverage inside the required Supabase clean replay", () => {
    const cleanReplay = read(".github/workflows/supabase-clean-replay-audit.yml");

    expect(cleanReplay).toContain("Execute deferred-work shared integration");
    expect(cleanReplay).toContain("tests/security/deferred-work-shared-integration.runtime.sql");
    expect(cleanReplay).toContain("psql \"$DB_URL\" -X -v ON_ERROR_STOP=1");
    expect(cleanReplay).toContain("deferred-work-shared-integration-runtime.log");
  });
});
