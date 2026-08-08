import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ShiftTracker from "@/features/shared/components/ShiftTracker";

const mocks = vi.hoisted(() => ({
  fetchMobileShiftState: vi.fn(),
}));

vi.mock("@/features/mobile/shifts/client", () => ({
  fetchMobileShiftState: mocks.fetchMobileShiftState,
}));

const offShiftState = {
  shiftId: null,
  shiftStatus: null,
  activity: "off_shift" as const,
  startTime: null,
  endTime: null,
  latestEventType: null,
  latestEventAt: null,
  mode: "none" as const,
};

describe("ShiftTracker workforce events", () => {
  beforeEach(() => {
    mocks.fetchMobileShiftState.mockReset();
    mocks.fetchMobileShiftState.mockResolvedValue(offShiftState);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not broadcast a workforce change while hydrating its initial state", async () => {
    const onShiftState = vi.fn();
    window.addEventListener("workforce:shift-state", onShiftState);

    render(<ShiftTracker userId="employee-1" />);

    await screen.findByRole("button", { name: "Punch in" });
    expect(mocks.fetchMobileShiftState).toHaveBeenCalledTimes(1);
    expect(onShiftState).not.toHaveBeenCalled();

    window.removeEventListener("workforce:shift-state", onShiftState);
  });

  it("broadcasts after a successful shift mutation", async () => {
    const onShiftState = vi.fn();
    window.addEventListener("workforce:shift-state", onShiftState);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        shiftId: "shift-1",
        shiftStatus: "active",
        activity: "working",
        startTime: "2026-08-07T15:00:00.000Z",
        endTime: null,
        latestEventType: "start_shift",
        latestEventAt: "2026-08-07T15:00:00.000Z",
        mode: "shift",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ShiftTracker userId="employee-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Punch in" }));

    await waitFor(() => expect(onShiftState).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/mobile/shifts",
      expect.objectContaining({ method: "POST" }),
    );

    window.removeEventListener("workforce:shift-state", onShiftState);
  });
});
