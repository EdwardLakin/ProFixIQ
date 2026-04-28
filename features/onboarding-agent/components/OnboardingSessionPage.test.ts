import { describe, expect, it } from "vitest";
import { getCustomerDisplayLabel, getVehicleDisplayLabel, linkIssueReasonLabel } from "@/features/onboarding-agent/components/OnboardingSessionPage";

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
});
