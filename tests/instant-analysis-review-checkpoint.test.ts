import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("instant analysis guided onboarding review checkpoint", () => {
  it("renders review inside guided onboarding only for instant-analysis sessions", () => {
    const workspace = read("features/onboarding-v2/components/GuidedOnboardingWorkspace.tsx");
    const panel = read("features/onboarding-v2/components/InstantAnalysisReviewPanel.tsx");

    expect(workspace).toContain('import InstantAnalysisReviewPanel from "./InstantAnalysisReviewPanel"');
    expect(workspace).toContain("<InstantAnalysisReviewPanel steps={detail.steps} />");
    expect(panel).toContain('answer.source !== "instant_shop_analysis"');
    expect(panel).toContain("answer.intakeId");
  });

  it("keeps cleanup scoped to the five guided onboarding data domains", () => {
    const panel = read("features/onboarding-v2/components/InstantAnalysisReviewPanel.tsx");

    expect(panel).toContain('{ key: "customers", label: "Customers" }');
    expect(panel).toContain('{ key: "vehicles", label: "Vehicles" }');
    expect(panel).toContain('{ key: "history", label: "History" }');
    expect(panel).toContain('{ key: "invoices", label: "Invoices" }');
    expect(panel).toContain('{ key: "parts", label: "Parts" }');
    expect(panel).not.toContain('{ key: "staff"');
  });

  it("loads pending and failed materializations for the activated intake", () => {
    const panel = read("features/onboarding-v2/components/InstantAnalysisReviewPanel.tsx");

    expect(panel).toContain('new URLSearchParams({ intakeId, status: "unresolved" })');
    expect(panel).toContain('item.status === "pending" || item.status === "failed_materialization"');
    expect(panel).toContain("Retry needed");
    expect(panel).toContain("Blocking launch");
    const listRoute = read("app/api/shop-boost/review-items/route.ts");
    expect(listRoute).toContain('query.in("status", ["pending", "failed_materialization"])');
  });

  it("supports recommended fixes, explicit risky confirmation, and reasoned ignores", () => {
    const panel = read("features/onboarding-v2/components/InstantAnalysisReviewPanel.tsx");

    expect(panel).toContain('resolution_action: resolutionAction');
    expect(panel).toContain('confirm_high_risk_action: options?.confirmHighRisk === true');
    expect(panel).toContain("Confirm and apply");
    expect(panel).toContain("Why should this row be ignored?");
    expect(panel).toContain("ignore_reason_code");
  });

  it("keeps cleanup under ten minutes with explicit safe bulk fixes", () => {
    const panel = read("features/onboarding-v2/components/InstantAnalysisReviewPanel.tsx");
    const safeRoute = read("app/api/shop-boost/review-items/apply-safe/route.ts");

    expect(panel).toContain("Fix \${safeItems.length} safe items");
    expect(panel).toContain("Duplicate merges and lower-confidence decisions always stay manual");
    expect(safeRoute).toContain("applyHighConfidenceRecommendations");
    expect(safeRoute).toContain("threshold: 0.85");
    expect(safeRoute).toContain('allowRoles: ["owner", "admin"]');
  });

  it("restricts review reads and writes to owners and admins", () => {
    const listRoute = read("app/api/shop-boost/review-items/route.ts");
    const itemRoute = read("app/api/shop-boost/review-items/[id]/route.ts");

    expect(listRoute).toContain('requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] })');
    expect(itemRoute).toContain('requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] })');
    expect(listRoute).toContain(".eq(\"shop_id\", shopId)");
    expect(itemRoute).toContain("shopId,");
  });
});
