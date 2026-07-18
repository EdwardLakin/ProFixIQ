import { describe, expect, it } from "vitest";
import {
  assessInstantAnalysisHistory,
  calculateInstantAnalysisDomainCoverage,
} from "@/features/integrations/shopBoost/analysisAccuracy";

describe("instant shop analysis accuracy", () => {
  it("groups repair-history lines into repair orders before reporting job counts", () => {
    const rows = Array.from({ length: 7_343 }, (_, index) => ({
      ro_number: `RO-${index % 12}`,
      customer_name: `Customer ${index % 12}`,
      vin: `VIN-${index % 12}`,
      description: "Historical line item",
    }));

    const assessment = assessInstantAnalysisHistory(rows);

    expect(assessment.rowCount).toBe(7_343);
    expect(assessment.uniqueJobCount).toBe(12);
    expect(assessment.readyJobCount).toBe(12);
    expect(assessment.reviewJobCount).toBe(0);
    expect(assessment.blockedJobCount).toBe(0);
    expect(assessment.linkageAccuracy).toBe(100);
  });

  it("counts linkage review once per repair order instead of once per line", () => {
    const rows = Array.from({ length: 300 }, (_, index) => ({
      repair_order: `RO-${index % 3}`,
      customer_id: `C-${index % 3}`,
      vehicle_vin: index % 3 === 1 ? "" : `VIN-${index % 3}`,
    }));

    const assessment = assessInstantAnalysisHistory(rows);

    expect(assessment.uniqueJobCount).toBe(3);
    expect(assessment.readyJobCount).toBe(2);
    expect(assessment.reviewJobCount).toBe(1);
    expect(assessment.unresolvedLinkCount).toBe(1);
    expect(assessment.linkageAccuracy).toBe(83);
  });

  it("only reports live workflow signals when the export explicitly supplies statuses", () => {
    const assessment = assessInstantAnalysisHistory([
      { ro: "100", customer: "A", vehicle: "VIN-A" },
      { ro: "101", customer: "B", vehicle: "VIN-B", status: "waiting for approval" },
      { ro: "102", customer: "C", vehicle: "VIN-C", work_order_status: "on hold" },
    ]);

    expect(assessment.explicitAwaitingApprovalCount).toBe(1);
    expect(assessment.explicitStalledCount).toBe(1);
  });

  it("scores coverage against the five datasets used by guided onboarding", () => {
    expect(
      calculateInstantAnalysisDomainCoverage({
        customers: 1,
        vehicles: 1,
        history: 1,
        invoices: 1,
        parts: 1,
      }),
    ).toBe(100);

    expect(
      calculateInstantAnalysisDomainCoverage({
        customers: 1,
        vehicles: 1,
        history: 1,
        invoices: 0,
        parts: 1,
      }),
    ).toBe(80);
  });
});
