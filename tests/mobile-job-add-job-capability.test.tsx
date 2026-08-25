import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const getUser = vi.fn();
  return {
    browserClient: { auth: { getUser } },
    fetch: vi.fn(),
    getUser,
    push: vi.fn(),
    refresh: vi.fn(),
    resolveCanonicalStaffProfile: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({
  useParams: () => ({ lineId: "line-1" }),
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

vi.mock("@/features/shared/lib/supabase/client", () => ({
  createBrowserSupabase: () => mocks.browserClient,
}));

vi.mock("@/features/shared/lib/authenticated-profile", () => ({
  resolveCanonicalStaffProfile: mocks.resolveCanonicalStaffProfile,
}));

vi.mock("@/features/shared/lib/offline/mutations", () => ({
  runMutationWithOfflineQueue: vi.fn(),
}));

vi.mock("@/features/shared/lib/offline/server-mutations", () => ({
  postOfflineServerMutation: vi.fn(),
}));

vi.mock("@/features/work-orders/lib/jobPunchTransitionsClient", () => ({
  runJobPunchTransition: vi.fn(),
}));

vi.mock(
  "@/features/work-orders/components/workorders/CauseCorrectionModal",
  () => ({
    default: () => null,
  }),
);

vi.mock("@/features/work-orders/mobile/MobileFocusedJob", () => ({
  default: ({ canAddJob }: { canAddJob?: boolean }) => (
    <div data-testid="focused-add-job-capability">{String(canAddJob)}</div>
  ),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

import MobileJobPage from "../app/mobile/jobs/[lineId]/page";

function storyResponse(): Response {
  return new Response(
    JSON.stringify({
      lines: [
        {
          id: "line-1",
          work_order_id: "work-order-1",
          complaint: "Brake vibration",
          description: "Inspect front brakes",
          cause: null,
          correction: null,
          status: "in_progress",
          updated_at: "2026-08-24T12:00:00.000Z",
        },
      ],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("standalone mobile job Add Job capability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "auth-user" } },
      error: null,
    });
    mocks.fetch.mockResolvedValue(storyResponse());
    vi.stubGlobal("fetch", mocks.fetch);
  });

  it.each([
    ["manager", true],
    ["lead_hand", true],
    ["parts", false],
    ["mechanic", false],
  ] as const)(
    "passes canAddJob=%s capability result %s without replacing the technician story flow",
    async (role, expected) => {
      mocks.resolveCanonicalStaffProfile.mockResolvedValue({
        profile: { id: "profile-1", role, shop_id: "shop-1" },
        error: null,
      });

      render(<MobileJobPage />);

      await waitFor(() =>
        expect(mocks.resolveCanonicalStaffProfile).toHaveBeenCalledWith(
          mocks.browserClient,
          "auth-user",
          { signal: expect.any(AbortSignal) },
        ),
      );
      await waitFor(() =>
        expect(
          screen.getByTestId("focused-add-job-capability"),
        ).toHaveTextContent(String(expected)),
      );
      expect(
        await screen.findByRole("button", {
          name: "Open cause and correction editor",
        }),
      ).toBeInTheDocument();
    },
  );

  it("fails closed when the canonical profile cannot be resolved", async () => {
    mocks.resolveCanonicalStaffProfile.mockResolvedValue({
      profile: null,
      error: "Profile unavailable",
    });

    render(<MobileJobPage />);

    await waitFor(() =>
      expect(mocks.resolveCanonicalStaffProfile).toHaveBeenCalledOnce(),
    );
    expect(screen.getByTestId("focused-add-job-capability")).toHaveTextContent(
      "false",
    );
  });
});
