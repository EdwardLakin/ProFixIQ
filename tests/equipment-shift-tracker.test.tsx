import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { MobileShiftState } from "@/features/mobile/shifts/client";

const mocks = vi.hoisted(() => ({
  profile: null as Record<string, unknown> | null,
  load: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/equipment/field",
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireActiveDemoAccessForPage: async () => mocks.profile,
}));
vi.mock("@/features/mobile/shifts/client", () => ({
  fetchMobileShiftState: mocks.load,
}));
vi.mock("@/features/equipment/components/EquipmentAccountControls", () => ({
  default: () => null,
}));
vi.mock("@/features/shared/components/ThemeToggleButton", () => ({
  default: () => null,
}));
vi.mock(
  "@/features/copilot/technician/components/TechnicianCopilotShell",
  () => ({ TechnicianCopilotShell: () => null }),
);

import EquipmentLayout from "../app/equipment/layout";
import EquipmentShell from "@/features/equipment/components/EquipmentShell";
import { WORKFORCE_STAFF_ROLES } from "@/features/workforce/lib/roster";

const off: MobileShiftState = {
  shiftId: null,
  shiftStatus: null,
  activity: "off_shift",
  startTime: null,
  endTime: null,
  latestEventType: null,
  latestEventAt: null,
  mode: "none",
};
const working: MobileShiftState = {
  ...off,
  shiftId: "shift-1",
  shiftStatus: "active",
  activity: "working",
  mode: "shift",
};
let desktop = true;
const listeners = new Set<() => void>();
beforeEach(() => {
  desktop = true;
  listeners.clear();
  mocks.profile = {
    id: "canonical-profile",
    user_id: "different-auth-id",
    shop_id: "shop-1",
    role: "mechanic",
  };
  mocks.load.mockReset().mockResolvedValue(off);
  vi.stubGlobal("matchMedia", (media: string) => ({
    media,
    get matches() {
      return desktop;
    },
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  }));
});

describe("Equipment shared shift tracker integration", () => {
  it.each([...WORKFORCE_STAFF_ROLES, "technician", "tech"])(
    "passes the canonical authenticated staff ID for %s",
    async (role) => {
      mocks.profile!.role = role;
      const shell = (await EquipmentLayout({ children: null })) as ReactElement;
      expect(shell.type).toBe(EquipmentShell);
      expect(shell.props.shiftUserId).toBe("canonical-profile");
    },
  );

  it.each(["customer", "fleet_manager", "driver", "unknown", null])(
    "withholds the tracker for unauthorized role %s",
    async (role) => {
      mocks.profile!.role = role;
      const shell = (await EquipmentLayout({ children: null })) as ReactElement;
      expect(shell.props.shiftUserId).toBeNull();
      render(shell);
      expect(
        screen.queryByRole("region", { name: "Shift Tracker" }),
      ).toBeNull();
      expect(mocks.load).not.toHaveBeenCalled();
    },
  );

  it("withholds the tracker without a shop or profile", async () => {
    mocks.profile!.shop_id = null;
    const shell = (await EquipmentLayout({ children: null })) as ReactElement;
    expect(shell.props.shiftUserId).toBeNull();
    mocks.profile = null;
    render(await EquipmentLayout({ children: <p>Page gate</p> }));
    expect(screen.getByText("Page gate")).toBeTruthy();
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it("keeps forced-password accounts behind the existing redirect", async () => {
    mocks.profile!.must_change_password = true;
    await expect(EquipmentLayout({ children: null })).rejects.toThrow(
      "REDIRECT:/auth/set-password",
    );
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it("mounts once on desktop and once in the opened mobile drawer, reloading on reopen", async () => {
    render(await EquipmentLayout({ children: null }));
    const sidebar = screen.getByRole("complementary", {
      name: "Equipment workspace",
    });
    expect(
      within(sidebar).getByRole("region", { name: "Shift Tracker" }),
    ).toBeTruthy();
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1));
    act(() => {
      desktop = false;
      listeners.forEach((cb) => cb());
    });
    expect(screen.queryByRole("region", { name: "Shift Tracker" })).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Open Equipment menu" }),
    );
    expect(
      within(screen.getByRole("dialog")).getAllByRole("region", {
        name: "Shift Tracker",
      }),
    ).toHaveLength(1);
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
    fireEvent.click(
      screen.getByRole("button", { name: "Close Equipment menu" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    mocks.load.mockResolvedValue(working);
    fireEvent.click(
      screen.getByRole("button", { name: "Open Equipment menu" }),
    );
    expect(
      await screen.findByRole("button", { name: "Punch out" }),
    ).toBeTruthy();
    expect(mocks.load).toHaveBeenCalledTimes(3);
  });

  it("reloads after server denial without broadcasting a mutation, then syncs external shift changes", async () => {
    const workforce = vi.fn();
    const labor = vi.fn();
    window.addEventListener("workforce:shift-state", workforce);
    window.addEventListener("wol:refresh", labor);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ ok: false, error: "Forbidden" }),
      }),
    );
    render(await EquipmentLayout({ children: null }));
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1));
    try {
      fireEvent.click(screen.getByRole("button", { name: "Punch in" }));
      await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
      expect(workforce).not.toHaveBeenCalled();
      expect(labor).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Punch in" })).toBeEnabled();
      act(() =>
        window.dispatchEvent(
          new CustomEvent("workforce:shift-state", { detail: working }),
        ),
      );
      expect(screen.getByRole("button", { name: "Punch out" })).toBeTruthy();
    } finally {
      window.removeEventListener("workforce:shift-state", workforce);
      window.removeEventListener("wol:refresh", labor);
    }
  });

  it.each([true, false])(
    "retains canonical actions, workforce events and labor refreshes (desktop=%s)",
    async (isDesktop) => {
      desktop = isDesktop;
      const workforce = vi.fn();
      const labor = vi.fn();
      window.addEventListener("workforce:shift-state", workforce);
      window.addEventListener("wol:refresh", labor);
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      render(await EquipmentLayout({ children: null }));
      if (!desktop)
        fireEvent.click(
          screen.getByRole("button", { name: "Open Equipment menu" }),
        );
      await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1));
      const steps = [
        ["Punch in", "start_shift", working],
        [
          "Break",
          "start_break",
          { ...working, mode: "break", activity: "on_break" },
        ],
        ["End Break", "end_break", working],
        [
          "Lunch",
          "start_lunch",
          { ...working, mode: "lunch", activity: "on_lunch" },
        ],
        ["End Lunch", "end_lunch", working],
        [
          "Punch out",
          "end_shift",
          { ...off, mode: "ended", shiftStatus: "completed" },
        ],
      ] as const;
      try {
        for (const [label, action, state] of steps) {
          fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ ok: true, ...state }),
          });
          fireEvent.click(
            await screen.findByRole("button", { name: label }),
          );
          await waitFor(() =>
            expect(fetchMock).toHaveBeenLastCalledWith("/api/mobile/shifts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action }),
            }),
          );
          await waitFor(() =>
            expect(workforce).toHaveBeenCalledTimes(
              fetchMock.mock.calls.length,
            ),
          );
        }
        expect(screen.getByText("Shift ended")).toBeTruthy();
        expect(fetchMock).toHaveBeenCalledTimes(6);
        expect(labor).toHaveBeenCalledTimes(5);
      } finally {
        window.removeEventListener("workforce:shift-state", workforce);
        window.removeEventListener("wol:refresh", labor);
      }
    },
  );
});
