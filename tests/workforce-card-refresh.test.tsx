import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MyWorkforceCard } from "@/features/workforce/components/MyWorkforceCard";

vi.mock("@/features/shared/components/ShiftTracker", () => ({
  default: () => <div>Shift controls</div>,
}));

const workforcePayload = {
  profile: {
    id: "employee-1",
    display_name: "Test Mechanic",
    email: "mechanic@example.com",
    role: "mechanic",
  },
  timezone: "America/Edmonton",
  current_shift: null,
  today_evidence: {
    gross_minutes: 558,
    break_minutes: 0,
    lunch_minutes: 0,
    recorded_minutes: 558,
    punch_count: 2,
    punches: [],
  },
  next_schedule: null,
  current_period: null,
  requests: [],
};

describe("MyWorkforceCard refresh behavior", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps loaded workforce details mounted during an event refresh", async () => {
    const pendingRefresh = new Promise(() => undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => workforcePayload,
      })
      .mockReturnValueOnce(pendingRefresh);
    vi.stubGlobal("fetch", fetchMock);

    render(<MyWorkforceCard />);

    expect(await screen.findByText("Clocked today")).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new CustomEvent("workforce:shift-state", {
          detail: { activity: "working" },
        }),
      );
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Clocked today")).toBeInTheDocument();
    expect(screen.getByText("Shift controls")).toBeInTheDocument();
    expect(screen.queryByText("Loading workforce details…")).not.toBeInTheDocument();
  });
});
