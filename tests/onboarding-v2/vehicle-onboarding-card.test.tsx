import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VehicleOnboardingSetupCard } from "@/features/customers/components/VehicleOnboardingSetupCard";
import type { GuidedOnboardingQuery } from "@/features/onboarding-v2/guided/query";

const router = { push: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const guidedQuery: GuidedOnboardingQuery = {
  onboardingSession: "session-123",
  onboardingStep: "vehicles",
  highlight: "vehicle-import",
  returnTo: "/dashboard/onboarding-v2/session-123",
  source: "guided-onboarding",
};

function okJson() {
  return { ok: true, json: async () => ({ ok: true }) };
}

describe("VehicleOnboardingSetupCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("explains vehicle setup ownership and opens the customer vehicle workflow", async () => {
    const onOpenVehicleWorkflow = vi.fn();
    render(<VehicleOnboardingSetupCard guidedQuery={guidedQuery} onOpenVehicleWorkflow={onOpenVehicleWorkflow} />);

    expect(screen.getByText("This is where vehicle setup/import will live.")).toBeInTheDocument();
    expect(
      screen.getByText("Vehicles are tied to customer files, so this step helps you prepare vehicle records in the real workflow."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("For now, you can create vehicles manually from customer files or mark this onboarding step complete."),
    ).toBeInTheDocument();
    expect(screen.getByText("CSV import will be added here next.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /create\/select a customer/i }));
    expect(onOpenVehicleWorkflow).toHaveBeenCalledTimes(1);
  });

  it("marks the vehicles guided step complete and returns to onboarding", async () => {
    const fetchMock = vi.fn(async () => okJson());
    vi.stubGlobal("fetch", fetchMock);

    render(<VehicleOnboardingSetupCard guidedQuery={guidedQuery} onOpenVehicleWorkflow={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /mark vehicles step complete/i }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard/onboarding-v2/session-123"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/onboarding-v2/guided/sessions/session-123/steps/vehicles/complete",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          summary: {
            manualSetup: true,
            importedCount: 0,
            note: "Vehicle setup step completed manually.",
          },
        }),
      }),
    );
  });

  it("skips the vehicles guided step and returns to onboarding", async () => {
    const fetchMock = vi.fn(async () => okJson());
    vi.stubGlobal("fetch", fetchMock);

    render(<VehicleOnboardingSetupCard guidedQuery={guidedQuery} onOpenVehicleWorkflow={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /skip vehicles/i }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard/onboarding-v2/session-123"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/onboarding-v2/guided/sessions/session-123/steps/vehicles/skip",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ skippedReason: "No vehicle import during onboarding." }),
      }),
    );
  });
});
