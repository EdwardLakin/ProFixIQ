import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  StaffOnboardingSetupCard,
  getStaffGuidedOnboardingQuery,
} from "@/features/dashboard/app/dashboard/owner/create-user/StaffOnboardingSetupCard";
import type { GuidedOnboardingQuery } from "@/features/onboarding-v2/guided/query";

const router = { push: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const guidedQuery: GuidedOnboardingQuery = {
  onboardingSession: "session-123",
  onboardingStep: "staff",
  highlight: "staff-import",
  returnTo: "/dashboard/onboarding-v2/session-123",
  source: "guided-onboarding",
};

function okJson() {
  return { ok: true, json: async () => ({ ok: true }) };
}

function StaffCardFromParams({ params }: { params: URLSearchParams }) {
  const query = getStaffGuidedOnboardingQuery(params);
  return query ? <StaffOnboardingSetupCard guidedQuery={query} onUseCreateUserForm={vi.fn()} /> : null;
}

describe("StaffOnboardingSetupCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders only in staff onboarding mode", () => {
    const onboardingParams = new URLSearchParams({
      onboardingSession: "session-123",
      onboardingStep: "staff",
      highlight: "staff-import",
      returnTo: "/dashboard/onboarding-v2/session-123",
      source: "guided-onboarding",
    });
    const normalParams = new URLSearchParams();

    const { rerender } = render(<StaffCardFromParams params={normalParams} />);
    expect(screen.queryByText("This is where staff setup lives.")).not.toBeInTheDocument();

    rerender(<StaffCardFromParams params={onboardingParams} />);
    expect(screen.getByText("This is where staff setup lives.")).toBeInTheDocument();
  });

  it("explains manual controlled staff setup and opens the create-user form", async () => {
    const onUseCreateUserForm = vi.fn();
    render(<StaffOnboardingSetupCard guidedQuery={guidedQuery} onUseCreateUserForm={onUseCreateUserForm} />);

    expect(screen.getByText("This is where staff setup lives.")).toBeInTheDocument();
    expect(
      screen.getByText("For now, add users manually so roles, usernames, passwords, and shop assignment stay controlled."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Bulk staff import will stage candidates first in a future phase and will not create login accounts without approval."),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /use create-user form/i }));
    expect(onUseCreateUserForm).toHaveBeenCalledTimes(1);
  });

  it("marks the staff guided step reviewed and returns to onboarding", async () => {
    const fetchMock = vi.fn(async () => okJson());
    vi.stubGlobal("fetch", fetchMock);

    render(<StaffOnboardingSetupCard guidedQuery={guidedQuery} onUseCreateUserForm={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /mark reviewed/i }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard/onboarding-v2/session-123"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/onboarding-v2/guided/sessions/session-123/steps/staff/complete",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          summary: {
            manualSetup: true,
            importedCount: 0,
            note: "Staff setup step completed manually.",
          },
        }),
      }),
    );
  });

  it("skips the staff guided step and returns to onboarding", async () => {
    const fetchMock = vi.fn(async () => okJson());
    vi.stubGlobal("fetch", fetchMock);

    render(<StaffOnboardingSetupCard guidedQuery={guidedQuery} onUseCreateUserForm={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /skip for now/i }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard/onboarding-v2/session-123"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/onboarding-v2/guided/sessions/session-123/steps/staff/skip",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ skippedReason: "No staff setup during onboarding." }),
      }),
    );
  });
});
