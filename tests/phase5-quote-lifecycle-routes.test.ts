import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const approvalRoute = read(
  "app/api/work-orders/quotes/[id]/approval-decision/route.ts",
);
const approvalHelper = read(
  "features/work-orders/server/workOrderQuoteLineApproval.ts",
);
const importRoute = read(
  "app/api/work-orders/import-from-inspection/route.ts",
);
const importer = read(
  "features/work-orders/lib/work-orders/insertPrioritizedJobsFromInspection.ts",
);
const readiness = read(
  "app/api/work-orders/[id]/_lib/reviewWorkOrder.ts",
);

describe("Phase 5 route and helper contract", () => {
  it("requires stable public operation keys", () => {
    expect(approvalRoute).toContain('headers.get("Idempotency-Key")');
    expect(approvalRoute).toContain("A stable Idempotency-Key is required.");
    expect(importRoute).toContain('headers.get("Idempotency-Key")');
    expect(importRoute).toContain("A stable Idempotency-Key is required.");
  });

  it("performs approve-selected and decline-remaining in one helper call", () => {
    expect(approvalRoute).toContain(
      "declineRemaining: body?.declineRemaining === true",
    );
    expect(approvalRoute).not.toContain("remainingIds");
    expect(approvalRoute).not.toContain("declineResult");
    expect(approvalHelper).toContain(
      'rpc("apply_customer_quote_decision_atomic"',
    );
    expect(approvalHelper).not.toContain(
      '.from("work_order_lines").insert',
    );
    expect(approvalHelper).not.toContain(
      '.from("work_order_quote_lines").update',
    );
  });

  it("keeps menu learning outside the customer-visible transaction", () => {
    expect(approvalHelper.indexOf("apply_customer_quote_decision_atomic")).toBeLessThan(
      approvalHelper.indexOf("upsertMenuRepairItemFromQuoteLine"),
    );
  });

  it("routes legacy inspection import through the atomic anchored command", () => {
    expect(importer).toContain(
      'rpc("import_inspection_quote_package_atomic"',
    );
    expect(importer).not.toContain("createCanonicalQuoteLines({");
    expect(importRoute).toContain(
      '.select("id, shop_id, work_order_id, work_order_line_id")',
    );
    expect(importRoute).toContain(
      "Inspection is not anchored to a work order",
    );
  });

  it("checks explicit recommendation eligibility before classification", () => {
    const eligibilityIndex = importer.indexOf(
      "isExplicitInspectionRecommendation(item)",
    );
    const classificationIndex = importer.indexOf(
      "classifyEligibleInspectionFinding",
      eligibilityIndex,
    );
    expect(eligibilityIndex).toBeGreaterThan(-1);
    expect(classificationIndex).toBeGreaterThan(eligibilityIndex);
    expect(importer).not.toContain('jobType !== "repair"');
  });

  it("excludes info lines while rejecting info-only work orders", () => {
    expect(readiness).toContain("function isInfoLine");
    expect(readiness).toContain("const actionableLines");
    expect(readiness).toContain('kind: "no_billable_lines"');
    expect(readiness).toContain("for (const line of actionableLines)");
  });
});
