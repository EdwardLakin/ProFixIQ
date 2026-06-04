import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomerOnboardingSetupCard } from "@/features/customers/components/CustomerOnboardingSetupCard";
import type { GuidedOnboardingQuery } from "@/features/onboarding-v2/guided/query";

const router = { push: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const guidedQuery: GuidedOnboardingQuery = {
  onboardingSession: "session-123",
  onboardingStep: "customers",
  highlight: "customer-import",
  returnTo: "/dashboard/onboarding-v2/session-123",
  source: "guided-onboarding",
};

function okJson() {
  return { ok: true, json: async () => ({ ok: true }) };
}

describe("CustomerOnboardingSetupCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("explains the placeholder customer import ownership and opens manual creation", async () => {
    const onCreateCustomer = vi.fn();
    render(<CustomerOnboardingSetupCard guidedQuery={guidedQuery} onCreateCustomer={onCreateCustomer} />);

    expect(screen.getByText("This is where customer setup/import will live.")).toBeInTheDocument();
    expect(screen.getByText("For now, you can create customers manually or mark this onboarding step complete.")).toBeInTheDocument();
    expect(screen.getByText("CSV import will be added here next.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /create customer/i }));
    expect(onCreateCustomer).toHaveBeenCalledTimes(1);
  });

  it("marks the customers guided step complete and returns to onboarding", async () => {
    const fetchMock = vi.fn(async () => okJson());
    vi.stubGlobal("fetch", fetchMock);

    render(<CustomerOnboardingSetupCard guidedQuery={guidedQuery} onCreateCustomer={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /mark customers step complete/i }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard/onboarding-v2/session-123"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/onboarding-v2/guided/sessions/session-123/steps/customers/complete",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          summary: {
            manualSetup: true,
            importedCount: 0,
            note: "Customer setup step completed manually.",
          },
        }),
      }),
    );
  });

  it("skips the customers guided step and returns to onboarding", async () => {
    const fetchMock = vi.fn(async () => okJson());
    vi.stubGlobal("fetch", fetchMock);

    render(<CustomerOnboardingSetupCard guidedQuery={guidedQuery} onCreateCustomer={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /skip customers/i }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard/onboarding-v2/session-123"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/onboarding-v2/guided/sessions/session-123/steps/customers/skip",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ skippedReason: "No customer import during onboarding." }),
      }),
    );
  });
});
