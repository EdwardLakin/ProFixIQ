import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  SettingsOnboardingSetupCard,
  getSettingsGuidedOnboardingQuery,
} from "@/features/dashboard/components/owner-settings/SettingsOnboardingSetupCard";
import type { GuidedOnboardingQuery } from "@/features/onboarding-v2/guided/query";

const router = { push: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const guidedQuery: GuidedOnboardingQuery = {
  onboardingSession: "session-123",
  onboardingStep: "labor_tax_shop_settings",
  highlight: "shop-settings",
  returnTo: "/dashboard/onboarding-v2/session-123",
  source: "guided-onboarding",
};

function okJson() {
  return { ok: true, json: async () => ({ ok: true }) };
}

function SettingsCardFromParams({ params }: { params: URLSearchParams }) {
  const query = getSettingsGuidedOnboardingQuery(params);
  return query ? <SettingsOnboardingSetupCard guidedQuery={query} onFocusSettingsArea={vi.fn()} /> : null;
}

describe("SettingsOnboardingSetupCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders only in labor/tax/shop settings onboarding mode", () => {
    const onboardingParams = new URLSearchParams({
      onboardingSession: "session-123",
      onboardingStep: "labor_tax_shop_settings",
      highlight: "shop-settings",
      returnTo: "/dashboard/onboarding-v2/session-123",
      source: "guided-onboarding",
    });
    const normalParams = new URLSearchParams();

    const { rerender } = render(<SettingsCardFromParams params={normalParams} />);
    expect(screen.queryByText("Review labor, tax, and shop settings")).not.toBeInTheDocument();

    rerender(<SettingsCardFromParams params={onboardingParams} />);
    expect(screen.getByText("Review labor, tax, and shop settings")).toBeInTheDocument();
  });

  it("explains the settings surface and focuses the operations defaults area", async () => {
    const onFocusSettingsArea = vi.fn();
    render(<SettingsOnboardingSetupCard guidedQuery={guidedQuery} onFocusSettingsArea={onFocusSettingsArea} />);

    expect(
      screen.getByText("This is where labor, tax, supplies, diagnostic fees, authorization defaults, and shop operations settings live."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Review these settings now so quotes, totals, invoices, and work orders calculate correctly."),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /review operations defaults/i }));
    expect(onFocusSettingsArea).toHaveBeenCalledTimes(1);
  });

  it("marks the settings guided step reviewed and returns to onboarding", async () => {
    const fetchMock = vi.fn(async () => okJson());
    vi.stubGlobal("fetch", fetchMock);

    render(<SettingsOnboardingSetupCard guidedQuery={guidedQuery} onFocusSettingsArea={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /mark settings reviewed/i }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard/onboarding-v2/session-123"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/onboarding-v2/guided/sessions/session-123/steps/labor_tax_shop_settings/complete",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          summary: {
            manualSetup: true,
            importedCount: 0,
            note: "Labor, tax, and shop settings reviewed.",
          },
        }),
      }),
    );
  });

  it("skips the settings guided step and returns to onboarding", async () => {
    const fetchMock = vi.fn(async () => okJson());
    vi.stubGlobal("fetch", fetchMock);

    render(<SettingsOnboardingSetupCard guidedQuery={guidedQuery} onFocusSettingsArea={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /skip settings for now/i }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard/onboarding-v2/session-123"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/onboarding-v2/guided/sessions/session-123/steps/labor_tax_shop_settings/skip",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ skippedReason: "Labor, tax, and shop settings skipped during onboarding." }),
      }),
    );
  });
});
