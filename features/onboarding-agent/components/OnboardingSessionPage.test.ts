import { describe, expect, it } from "vitest";
import { getCustomerDisplayLabel, getVehicleDisplayLabel, linkIssueReasonLabel, unresolvedReviewPrimaryCopy } from "@/features/onboarding-agent/components/OnboardingSessionPage";

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
});
