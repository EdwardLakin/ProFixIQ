import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const findingsPage = readFileSync(
  "features/inspections/lib/inspection/findings/page.tsx",
  "utf8",
);
const sectionDisplay = readFileSync(
  "features/inspections/lib/inspection/SectionDisplay.tsx",
  "utf8",
);
const genericScreen = readFileSync(
  "features/inspections/screens/GenericInspectionScreen.tsx",
  "utf8",
);
const jobPunchTransition = readFileSync(
  "features/work-orders/server/applyJobPunchTransition.ts",
  "utf8",
);

describe("inspection review submission blockers", () => {
  it("submits reviewed findings to canonical quote review without finishing the originating line", () => {
    expect(findingsPage).toContain('/api/work-orders/quotes/add');
    expect(findingsPage).not.toContain('/api/work-orders/lines/${resolvedWorkOrderLineId}/finish');
    expect(findingsPage).not.toContain('Failed to finish inspection');
    expect(findingsPage).toContain('estimateSubmitted: true');
    expect(findingsPage).toContain('estimateQuoteLineId:');
    expect(findingsPage).toContain('/api/inspections/finalize/pdf');
  });

  it("keeps explicit technician job completion in the punch transition flow", () => {
    expect(jobPunchTransition).toContain('action === "finish"');
    expect(jobPunchTransition).toContain('status: "completed"');
    expect(jobPunchTransition).toContain('completed: true');
    expect(jobPunchTransition).toContain('punched_out_at: nowIso');
  });

  it("allows technicians to apply expired smart matches as advisory pricing review", () => {
    expect(sectionDisplay).toContain('Expired pricing — pricing review required after apply.');
    expect(sectionDisplay).not.toContain('Auto-add blocked');
    expect(sectionDisplay).toContain('Apply repair');
    expect(sectionDisplay).toContain('Pricing review required');
    expect(genericScreen).toContain('pricingStatus: match.pricingStatus ?? null');
    expect(findingsPage).toContain('pricing_review_required: acceptedMatch.pricingStatus !== "fresh"');
    expect(findingsPage).toContain('technician_pricing_approved: false');
  });
});
