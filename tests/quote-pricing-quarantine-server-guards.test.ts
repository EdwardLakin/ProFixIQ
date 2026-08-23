import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(file, "utf8");
const patternIndex = (value: string, pattern: RegExp): number =>
  value.search(pattern);

describe("quote pricing quarantine server entry points", () => {
  it("blocks canonical delivery before reserving or sending email", () => {
    const route = source("app/api/quotes/send/route.ts");
    const guard = route.indexOf("const quarantinedQuoteLineIds");
    const reservation = route.indexOf(
      'supabaseAdmin.rpc("reserve_estimate_send_atomic"',
    );
    const delivery = route.indexOf("await sendQuoteReadyEmail({");

    expect(guard).toBeGreaterThan(-1);
    expect(route).toContain("QUOTE_PRICING_QUARANTINED_CODE");
    expect(guard).toBeLessThan(reservation);
    expect(guard).toBeLessThan(delivery);
  });

  it("preflights canonical quote decisions before their atomic RPC", () => {
    const helper = source(
      "features/work-orders/server/workOrderQuoteLineApproval.ts",
    );
    const guard = helper.indexOf("await checkQuotePricingQuarantine({");
    const shopDecision = helper.indexOf(
      'rpc.rpc("apply_shop_quote_decision_atomic"',
    );
    const portalDecision = helper.indexOf(
      'rpc.rpc("apply_portal_quote_decision_atomic"',
    );

    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(shopDecision);
    expect(guard).toBeLessThan(portalDecision);
  });

  it("guards compatibility materialization and legacy decision routes", () => {
    const compatibility = source("app/api/quotes/approval-webhook/route.ts");
    const lineDecision = source(
      "app/api/work-orders/lines/[id]/approval-decision/route.ts",
    );
    const legacyApproval = source(
      "app/api/work-orders/quotes/[id]/approval/route.ts",
    );

    const compatibilityReplay = compatibility.indexOf(
      '.eq("operation_name", "approval_compatibility_bundle")',
    );
    const compatibilityGuard = compatibility.indexOf(
      "await checkQuotePricingQuarantine({",
    );
    const compatibilityRpc = patternIndex(
      compatibility,
      /rpc\.rpc\(\s*"apply_approval_compatibility_bundle_atomic"/,
    );
    expect(compatibilityReplay).toBeGreaterThan(-1);
    expect(compatibilityReplay).toBeLessThan(compatibilityGuard);
    expect(compatibilityGuard).toBeLessThan(compatibilityRpc);
    expect(
      lineDecision.indexOf("await checkQuotePricingQuarantine({"),
    ).toBeLessThan(
      patternIndex(
        lineDecision,
        /rpc\.rpc\(\s*"apply_portal_line_decision_atomic"/,
      ),
    );
    expect(
      legacyApproval.indexOf("await checkQuotePricingQuarantine({"),
    ).toBeLessThan(
      patternIndex(legacyApproval, /\.from\("work_orders"\)\s*\.update/),
    );
  });

  it("routes staff declines through the guarded API and protects legacy sends", () => {
    const workOrderClient = source("app/work-orders/[id]/Client.tsx");
    const sendForApproval = source("app/api/quotes/send-for-approval/route.ts");
    const markQuoted = source(
      "app/api/work-orders/quotes/[id]/mark-quoted/route.ts",
    );

    expect(workOrderClient).toContain(
      "/api/work-orders/quotes/${encodeURIComponent(quoteId)}/decline",
    );
    expect(workOrderClient).not.toContain(
      '.update({ status: "declined" })\n        .eq("id", quoteId)',
    );
    expect(
      sendForApproval.indexOf("await checkQuotePricingQuarantine({"),
    ).toBeLessThan(sendForApproval.indexOf('supabase.rpc("send_for_approval"'));
    expect(
      markQuoted.indexOf(
        "if (isQuoteCustomerPricingQuarantined(quoteLine.metadata))",
      ),
    ).toBeLessThan(markQuoted.indexOf('.update({ status: "quoted"'));
  });
});
