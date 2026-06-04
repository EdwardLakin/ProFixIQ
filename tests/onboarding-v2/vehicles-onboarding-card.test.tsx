import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VehicleOnboardingSetupCard } from "@/features/vehicles/components/VehicleOnboardingSetupCard";
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

describe("Vehicles page onboarding setup card", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the Vehicles-owned guided import/setup copy", () => {
    render(<VehicleOnboardingSetupCard guidedQuery={guidedQuery} />);

    expect(screen.getByTestId("vehicles-onboarding-card")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Vehicle import/setup" })).toBeInTheDocument();
    expect(screen.getAllByText("Guided onboarding brought you here because Vehicles owns unit, VIN, plate, and asset setup.").length).toBeGreaterThan(0);
    expect(screen.getByText("CSV import will be added here next. For now, add vehicles manually or mark this step complete.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /add vehicle/i })).toHaveAttribute("href", "#add-vehicle");
  });

  it("marks the vehicles guided step complete and returns to onboarding", async () => {
    const fetchMock = vi.fn(async () => okJson());
    vi.stubGlobal("fetch", fetchMock);

    render(<VehicleOnboardingSetupCard guidedQuery={guidedQuery} />);
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
            note: "Vehicle setup step completed manually from the Vehicles directory.",
          },
        }),
      }),
    );
  });

  it("skips the vehicles guided step and returns to onboarding", async () => {
    const fetchMock = vi.fn(async () => okJson());
    vi.stubGlobal("fetch", fetchMock);

    render(<VehicleOnboardingSetupCard guidedQuery={guidedQuery} />);
    await userEvent.click(screen.getByRole("button", { name: /skip vehicles/i }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard/onboarding-v2/session-123"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/onboarding-v2/guided/sessions/session-123/steps/vehicles/skip",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ skippedReason: "Vehicle import is not available yet." }),
      }),
    );
  });
});
