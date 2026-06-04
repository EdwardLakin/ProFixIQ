import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  InvoicesOnboardingSetupCard,
  getInvoicesGuidedOnboardingQuery,
} from "@/features/invoices/components/InvoicesOnboardingSetupCard";
import type { GuidedOnboardingQuery } from "@/features/onboarding-v2/guided/query";

const router = { push: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const guidedQuery: GuidedOnboardingQuery = {
  onboardingSession: "session-123",
  onboardingStep: "invoices",
  highlight: "invoice-import",
  returnTo: "/dashboard/onboarding-v2/session-123",
  source: "guided-onboarding",
};

function okJson() {
  return { ok: true, json: async () => ({ ok: true }) };
}

function InvoicesCardFromParams({ params }: { params: URLSearchParams }) {
  return <InvoicesOnboardingSetupCard guidedQuery={getInvoicesGuidedOnboardingQuery(params)} />;
}

describe("InvoicesOnboardingSetupCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders only in invoices onboarding mode", () => {
    const onboardingParams = new URLSearchParams({
      onboardingSession: "session-123",
      onboardingStep: "invoices",
      highlight: "invoice-import",
      returnTo: "/dashboard/onboarding-v2/session-123",
      source: "guided-onboarding",
    });
    const normalParams = new URLSearchParams();

    const { rerender } = render(<InvoicesCardFromParams params={normalParams} />);
    expect(screen.queryByText("Review historical invoice setup")).not.toBeInTheDocument();

    rerender(<InvoicesCardFromParams params={onboardingParams} />);
    expect(screen.getByText("Review historical invoice setup")).toBeInTheDocument();
  });

  it("explains planned invoice import wiring", () => {
    render(<InvoicesOnboardingSetupCard guidedQuery={guidedQuery} />);

    expect(
      screen.getByText(
        "Invoice import will live here so historical billing records stay connected to your real invoice workflow.",
      ),
    ).toBeInTheDocument();
  });

  it("marks the invoices guided step reviewed and returns to onboarding", async () => {
    const fetchMock = vi.fn(async () => okJson());
    vi.stubGlobal("fetch", fetchMock);

    render(<InvoicesOnboardingSetupCard guidedQuery={guidedQuery} />);
    await userEvent.click(screen.getByRole("button", { name: /mark invoices reviewed/i }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard/onboarding-v2/session-123"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/onboarding-v2/guided/sessions/session-123/steps/invoices/complete",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          summary: {
            manualSetup: true,
            importedCount: 0,
            note: "Invoices reviewed.",
          },
        }),
      }),
    );
  });

  it("skips the invoices guided step and returns to onboarding", async () => {
    const fetchMock = vi.fn(async () => okJson());
    vi.stubGlobal("fetch", fetchMock);

    render(<InvoicesOnboardingSetupCard guidedQuery={guidedQuery} />);
    await userEvent.click(screen.getByRole("button", { name: /skip invoices for now/i }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard/onboarding-v2/session-123"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/onboarding-v2/guided/sessions/session-123/steps/invoices/skip",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ skippedReason: "Invoices skipped during onboarding." }),
      }),
    );
  });
});
