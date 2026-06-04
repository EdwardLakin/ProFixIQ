import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ServiceHistoryOnboardingSetupCard,
  getServiceHistoryGuidedOnboardingQuery,
} from "@/features/work-orders/components/history/ServiceHistoryOnboardingSetupCard";
import type { GuidedOnboardingQuery } from "@/features/onboarding-v2/guided/query";

const router = { push: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const guidedQuery: GuidedOnboardingQuery = {
  onboardingSession: "session-123",
  onboardingStep: "service_history",
  highlight: "service-history-import",
  returnTo: "/dashboard/onboarding-v2/session-123",
  source: "guided-onboarding",
};

function okJson() {
  return { ok: true, json: async () => ({ ok: true }) };
}

function ServiceHistoryCardFromParams({ params }: { params: URLSearchParams }) {
  return <ServiceHistoryOnboardingSetupCard guidedQuery={getServiceHistoryGuidedOnboardingQuery(params)} />;
}

describe("ServiceHistoryOnboardingSetupCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders only in service history onboarding mode", () => {
    const onboardingParams = new URLSearchParams({
      onboardingSession: "session-123",
      onboardingStep: "service_history",
      highlight: "service-history-import",
      returnTo: "/dashboard/onboarding-v2/session-123",
      source: "guided-onboarding",
    });
    const normalParams = new URLSearchParams();

    const { rerender } = render(<ServiceHistoryCardFromParams params={normalParams} />);
    expect(screen.queryByText("Review historical service setup")).not.toBeInTheDocument();

    rerender(<ServiceHistoryCardFromParams params={onboardingParams} />);
    expect(screen.getByText("Review historical service setup")).toBeInTheDocument();
  });

  it("explains planned service history import wiring", () => {
    render(<ServiceHistoryOnboardingSetupCard guidedQuery={guidedQuery} />);

    expect(
      screen.getByText(
        "Service history import will live here so past repairs stay tied to the real work order history.",
      ),
    ).toBeInTheDocument();
  });

  it("marks the service history guided step reviewed and returns to onboarding", async () => {
    const fetchMock = vi.fn(async () => okJson());
    vi.stubGlobal("fetch", fetchMock);

    render(<ServiceHistoryOnboardingSetupCard guidedQuery={guidedQuery} />);
    await userEvent.click(screen.getByRole("button", { name: /mark service history reviewed/i }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard/onboarding-v2/session-123"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/onboarding-v2/guided/sessions/session-123/steps/service_history/complete",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          summary: {
            manualSetup: true,
            importedCount: 0,
            note: "Service history reviewed.",
          },
        }),
      }),
    );
  });

  it("skips the service history guided step and returns to onboarding", async () => {
    const fetchMock = vi.fn(async () => okJson());
    vi.stubGlobal("fetch", fetchMock);

    render(<ServiceHistoryOnboardingSetupCard guidedQuery={guidedQuery} />);
    await userEvent.click(screen.getByRole("button", { name: /skip service history for now/i }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard/onboarding-v2/session-123"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/onboarding-v2/guided/sessions/session-123/steps/service_history/skip",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ skippedReason: "Service history skipped during onboarding." }),
      }),
    );
  });
});
