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
const jobPunchMigration = readFileSync(
  "supabase/migrations/20260714050000_phase4_atomic_technician_labor.sql",
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
    expect(jobPunchTransition).toContain('"apply_job_punch_transition_atomic"');
    expect(jobPunchTransition).toContain("p_action: action");
    expect(jobPunchMigration).toContain("v_action not in ('start','resume','pause','finish')");
    expect(jobPunchMigration).toContain("status = 'completed'");
    expect(jobPunchMigration).toContain("completed = true");
    expect(jobPunchMigration).toContain(
      "punched_out_at = case when coalesce(v_has_open, false) then null else v_latest end",
    );
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

  it("keeps technician and accepted-menu truth authoritative during canonical submission", () => {
    expect(findingsPage).toContain("const verifiedParts:");
    expect(findingsPage).toContain("manualParts.length > 0");
    expect(findingsPage).toContain(": acceptedMenuParts;");
    expect(findingsPage).not.toContain("...suggestionParts");
    expect(findingsPage).toContain("const laborRate = null;");
    expect(findingsPage).toContain("const laborTotal = null;");
    expect(findingsPage).toContain(
      'status: verifiedParts.length > 0 ? "pending_parts" : "advisor_pending"',
    );
  });

  it("does not turn successful quote submission into an invoice-readiness warning", () => {
    expect(findingsPage).not.toContain(
      '`/api/work-orders/${resolvedWorkOrderId}/invoice`',
    );
    expect(findingsPage).toContain('toast.success("Findings sent to quote review.")');
  });
});
