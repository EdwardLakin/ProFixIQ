import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  InspectionTemplatesOnboardingSetupCard,
  getInspectionTemplatesGuidedOnboardingQuery,
} from "@/features/inspections/components/InspectionTemplatesOnboardingSetupCard";
import type { GuidedOnboardingQuery } from "@/features/onboarding-v2/guided/query";

const router = { push: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const guidedQuery: GuidedOnboardingQuery = {
  onboardingSession: "session-123",
  onboardingStep: "inspection_templates",
  highlight: "inspection-template-import",
  returnTo: "/dashboard/onboarding-v2/session-123",
  source: "guided-onboarding",
};

function okJson() {
  return { ok: true, json: async () => ({ ok: true }) };
}

function InspectionTemplatesCardFromParams({ params }: { params: URLSearchParams }) {
  const query = getInspectionTemplatesGuidedOnboardingQuery(params);
  return query ? <InspectionTemplatesOnboardingSetupCard guidedQuery={query} onFocusTemplateArea={vi.fn()} /> : null;
}

describe("InspectionTemplatesOnboardingSetupCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders only in inspection templates onboarding mode", () => {
    const onboardingParams = new URLSearchParams({
      onboardingSession: "session-123",
      onboardingStep: "inspection_templates",
      highlight: "inspection-template-import",
      returnTo: "/dashboard/onboarding-v2/session-123",
      source: "guided-onboarding",
    });
    const normalParams = new URLSearchParams();

    const { rerender } = render(<InspectionTemplatesCardFromParams params={normalParams} />);
    expect(screen.queryByText("Set up or import inspection templates")).not.toBeInTheDocument();

    rerender(<InspectionTemplatesCardFromParams params={onboardingParams} />);
    expect(screen.getByText("Set up or import inspection templates")).toBeInTheDocument();
  });

  it("explains template setup/import and focuses the existing template area", async () => {
    const onFocusTemplateArea = vi.fn();
    render(<InspectionTemplatesOnboardingSetupCard guidedQuery={guidedQuery} onFocusTemplateArea={onFocusTemplateArea} />);

    expect(
      screen.getByText(
        "Inspection templates are reusable checklists for PMs, CVIP-style inspections, customer inspections, and shop-specific forms.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("You can create templates manually or import an existing form and review it before using it."),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /review template creation\/import/i }));
    expect(onFocusTemplateArea).toHaveBeenCalledTimes(1);
  });

  it("marks the inspection templates guided step reviewed and returns to onboarding", async () => {
    const fetchMock = vi.fn(async () => okJson());
    vi.stubGlobal("fetch", fetchMock);

    render(<InspectionTemplatesOnboardingSetupCard guidedQuery={guidedQuery} onFocusTemplateArea={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /mark templates reviewed/i }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard/onboarding-v2/session-123"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/onboarding-v2/guided/sessions/session-123/steps/inspection_templates/complete",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          summary: {
            manualSetup: true,
            importedCount: 0,
            note: "Inspection templates reviewed.",
          },
        }),
      }),
    );
  });

  it("skips the inspection templates guided step and returns to onboarding", async () => {
    const fetchMock = vi.fn(async () => okJson());
    vi.stubGlobal("fetch", fetchMock);

    render(<InspectionTemplatesOnboardingSetupCard guidedQuery={guidedQuery} onFocusTemplateArea={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /skip inspection templates for now/i }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard/onboarding-v2/session-123"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/onboarding-v2/guided/sessions/session-123/steps/inspection_templates/skip",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ skippedReason: "Inspection templates skipped during onboarding." }),
      }),
    );
  });
});
