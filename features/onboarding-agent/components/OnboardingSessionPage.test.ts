import { describe, expect, it } from "vitest";
import { getCustomerDisplayLabel, getVehicleDisplayLabel, groupReviewItemsByDomain, historyActivationState, linkIssueReasonLabel, partsVendorGuidance, unresolvedReviewPrimaryCopy } from "@/features/onboarding-agent/components/OnboardingSessionPage";
import { agentInsightsStateCopy } from "@/features/onboarding-agent/components/OnboardingAgentInsightsPanel";
import { activationPreviewCopy } from "@/features/onboarding-agent/components/OnboardingActivationPlanPanel";
import { groupReviewIssuesForDisplay } from "@/features/onboarding-agent/components/OnboardingReviewPanel";

describe("OnboardingSessionPage warning label helpers", () => {
  it("builds human-readable customer labels", () => {
    expect(getCustomerDisplayLabel({ businessName: "Northern Shield Security", email: "accounts@nss.com" })).toBe("Northern Shield Security");
    expect(getCustomerDisplayLabel({ firstName: "Jane", lastName: "Doe" })).toBe("Jane Doe");
    expect(getCustomerDisplayLabel({ email: "jane@example.com" })).toBe("jane@example.com");
  });

  it("builds human-readable vehicle labels", () => {
    expect(getVehicleDisplayLabel({ year: 2019, make: "Ford", model: "F-550", vin: "1FD123" })).toBe("2019 Ford F-550 — VIN 1FD123");
    expect(getVehicleDisplayLabel({ licensePlate: "ABC123" })).toBe("Plate ABC123");
  });

  it("maps unresolved link reasons to plain-English triage labels", () => {
    expect(linkIssueReasonLabel("vehicle_linked_to_different_customer")).toContain("different customer");
    expect(linkIssueReasonLabel("ambiguous_customer_match")).toContain("ambiguous");
  });

  it("keeps UUIDs out of unresolved-link primary copy", () => {
    const copy = unresolvedReviewPrimaryCopy({
      id: "review-uuid-1",
      status: "pending",
      details: {
        proposedCustomerLabel: "Canyon Civil 4",
        proposedVehicleLabel: "2012 Ford Transit — VIN EMDZE5XJXPNM2Z9M9",
        reasonLabel: "Customer match was ambiguous.",
        stagedCustomerEntityId: "uuid-customer-123",
      },
    });

    expect(copy.customer).toBe("Canyon Civil 4");
    expect(copy.vehicle).toContain("Ford Transit");
    expect(copy.reason).toContain("ambiguous");
    expect(copy.customer).not.toContain("uuid");
  });

  it("groups review items by domain for operator panel", () => {
    const grouped = groupReviewItemsByDomain([
      { domain: "vendors" },
      { domain: "parts" },
      { domain: "vendors" },
      {},
    ]);
    expect(grouped.vendors).toBe(2);
    expect(grouped.parts).toBe(1);
    expect(grouped.unknown).toBe(1);
  });

  it("switches agent insights copy after activation starts", () => {
    expect(agentInsightsStateCopy(false)).toContain("No live records have been created yet");
    expect(agentInsightsStateCopy(true)).toContain("Activation has started");
    expect(agentInsightsStateCopy(true)).toContain("invoices remain staged");
  });

  it("switches dry-run label after activation starts", () => {
    expect(activationPreviewCopy(false).title).toBe("Dry-run activation preview");
    expect(activationPreviewCopy(true).title).toBe("Activation readiness snapshot");
  });

  it("renders vendor-before-parts guidance when vendor links are unavailable", () => {
    expect(partsVendorGuidance({ canShowPartsActivation: true, vendorsActivated: false, vendorPartLinkCount: 0 })).toContain("vendor links may require review");
    expect(partsVendorGuidance({ canShowPartsActivation: true, vendorsActivated: true, vendorPartLinkCount: 0 })).toContain("No vendor-part relationships");
  });

  it("groups repeated review summaries into a single display bucket", () => {
    const grouped = groupReviewIssuesForDisplay([
      { id: "1", severity: "medium", domain: "parts", issue_type: "missing_vendor", summary: "Vendor not found", details: { a: 1 } },
      { id: "2", severity: "medium", domain: "parts", issue_type: "missing_vendor", summary: "Vendor not found", details: { a: 2 } },
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.count).toBe(2);
  });

  it("does not mark history as activated when all processed rows were skipped", () => {
    expect(historyActivationState({ stagedProcessed: 6076, created: 0, matched: 0, skipped: 6076 })).toBe("blocked");
  });

  it("marks history as activated when rows are created or matched", () => {
    expect(historyActivationState({ stagedProcessed: 6076, created: 12, matched: 0, skipped: 6064 })).toBe("activated");
    expect(historyActivationState({ stagedProcessed: 6076, created: 0, matched: 12, skipped: 6064 })).toBe("activated");
  });
});
