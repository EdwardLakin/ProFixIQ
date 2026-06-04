import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ServiceMenuOnboardingSetupCard,
  getServiceMenuGuidedOnboardingQuery,
} from "@/features/menu/components/ServiceMenuOnboardingSetupCard";
import type { GuidedOnboardingQuery } from "@/features/onboarding-v2/guided/query";

const router = { push: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const guidedQuery: GuidedOnboardingQuery = {
  onboardingSession: "session-123",
  onboardingStep: "service_menu",
  highlight: "service-menu-setup",
  returnTo: "/dashboard/onboarding-v2/session-123",
  source: "guided-onboarding",
};

function okJson() {
  return { ok: true, json: async () => ({ ok: true }) };
}

function ServiceMenuCardFromParams({ params }: { params: URLSearchParams }) {
  return (
    <ServiceMenuOnboardingSetupCard
      guidedQuery={getServiceMenuGuidedOnboardingQuery(params)}
      onFocusCreateArea={vi.fn()}
    />
  );
}

describe("ServiceMenuOnboardingSetupCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders only in service menu onboarding mode", () => {
    const onboardingParams = new URLSearchParams({
      onboardingSession: "session-123",
      onboardingStep: "service_menu",
      highlight: "service-menu-setup",
      returnTo: "/dashboard/onboarding-v2/session-123",
      source: "guided-onboarding",
    });
    const normalParams = new URLSearchParams();

    const { rerender } = render(<ServiceMenuCardFromParams params={normalParams} />);
    expect(screen.queryByText("Review or create your service menu")).not.toBeInTheDocument();

    rerender(<ServiceMenuCardFromParams params={onboardingParams} />);
    expect(screen.getByText("Review or create your service menu")).toBeInTheDocument();
  });

  it("explains manual service menu setup and focuses the creation area", async () => {
    const onFocusCreateArea = vi.fn();
    render(<ServiceMenuOnboardingSetupCard guidedQuery={guidedQuery} onFocusCreateArea={onFocusCreateArea} />);

    expect(
      screen.getByText(
        "Service menu items are reusable jobs, canned repairs, inspection recommendations, and common services your team can add quickly to work orders.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "For now, review or create your most common services manually. CSV import/staging can be added here later.",
      ),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /review menu item creation/i }));
    expect(onFocusCreateArea).toHaveBeenCalledTimes(1);
  });

  it("marks the service menu guided step reviewed and returns to onboarding", async () => {
    const fetchMock = vi.fn(async () => okJson());
    vi.stubGlobal("fetch", fetchMock);

    render(<ServiceMenuOnboardingSetupCard guidedQuery={guidedQuery} onFocusCreateArea={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /mark service menu reviewed/i }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard/onboarding-v2/session-123"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/onboarding-v2/guided/sessions/session-123/steps/service_menu/complete",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          summary: {
            manualSetup: true,
            importedCount: 0,
            note: "Service menu reviewed.",
          },
        }),
      }),
    );
  });

  it("skips the service menu guided step and returns to onboarding", async () => {
    const fetchMock = vi.fn(async () => okJson());
    vi.stubGlobal("fetch", fetchMock);

    render(<ServiceMenuOnboardingSetupCard guidedQuery={guidedQuery} onFocusCreateArea={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /skip service menu for now/i }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard/onboarding-v2/session-123"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/onboarding-v2/guided/sessions/session-123/steps/service_menu/skip",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ skippedReason: "Service menu skipped during onboarding." }),
      }),
    );
  });
});
