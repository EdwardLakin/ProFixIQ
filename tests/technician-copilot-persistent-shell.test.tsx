import React from "react";
import { readFileSync } from "node:fs";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
let pathname = "/dashboard";
const availability = vi.hoisted(() => ({
  state: {
    status: "available" as "available" | "unavailable",
    message: null as string | null,
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ replace }),
}));

vi.mock(
  "@/features/copilot/technician/client/useTechnicianCopilotAvailability",
  () => ({
    useTechnicianCopilotAvailability: () =>
      availability.state.status === "available",
    useTechnicianCopilotAvailabilityState: () => availability.state,
  }),
);

vi.mock(
  "@/features/copilot/technician/components/TechnicianTextCopilot",
  () => ({
    TechnicianTextCopilot: ({
      active,
      compact,
    }: {
      active?: boolean;
      compact?: boolean;
    }) => (
      <div
        data-testid="copilot-runtime"
        data-active={String(active)}
        data-compact={String(compact)}
      />
    ),
  }),
);

import {
  openTechnicianCopilot,
  TechnicianCopilotShell,
} from "@/features/copilot/technician/components/TechnicianCopilotShell";
import { TechnicianCopilotCompatibilityRoute } from "@/features/copilot/technician/components/TechnicianCopilotCompatibilityRoute";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

describe("persistent Technician CoPilot shell", () => {
  beforeEach(() => {
    pathname = "/dashboard";
    replace.mockReset();
    availability.state = { status: "available", message: null };
    document.body.style.pointerEvents = "";
    document.body.removeAttribute("data-scroll-locked");
  });

  it("keeps one collaborator runtime mounted while the panel opens and closes", () => {
    render(<TechnicianCopilotShell shouldCheck surface="desktop" />);

    expect(screen.getByTestId("copilot-runtime")).toHaveAttribute(
      "data-active",
      "false",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Open Technician CoPilot" }),
    );

    expect(
      screen.getByRole("dialog", { name: "Technician CoPilot" }),
    ).toBeVisible();
    expect(screen.getByTestId("copilot-runtime")).toHaveAttribute(
      "data-active",
      "true",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Close Technician CoPilot" }),
    );

    expect(screen.getByTestId("copilot-runtime")).toHaveAttribute(
      "data-active",
      "false",
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it("keeps a compact mobile voice dock mounted without blocking the page", () => {
    pathname = "/mobile/tech/queue";
    render(<TechnicianCopilotShell shouldCheck surface="mobile" />);

    const runtime = screen.getByTestId("copilot-runtime");
    const launcher = screen.getByRole("button", {
      name: "Open Technician CoPilot",
    });
    expect(runtime).toHaveAttribute("data-active", "false");
    expect(launcher).toHaveClass(
      "bottom-[calc(4.75rem+env(safe-area-inset-bottom))]",
    );
    expect(launcher).not.toHaveClass(
      "bottom-[calc(10rem+env(safe-area-inset-bottom))]",
      "bottom-[calc(13.7rem+max(0.75rem,env(safe-area-inset-bottom,0px)))]",
    );

    fireEvent.click(launcher);

    const dock = screen.getByRole("region", { name: "Technician CoPilot" });
    expect(dock).toHaveAttribute("aria-hidden", "false");
    expect(dock).not.toHaveAttribute("aria-modal");
    expect(dock).toHaveClass(
      "visible",
      "pointer-events-auto",
      "opacity-100",
      "inset-x-3",
      "bottom-[calc(1rem+env(safe-area-inset-bottom))]",
      "max-h-[min(21rem,calc(100dvh-7rem))]",
      "z-40",
    );
    expect(dock).not.toHaveClass(
      "bottom-[calc(10rem+env(safe-area-inset-bottom))]",
      "max-h-[min(21rem,calc(100dvh-16rem))]",
      "bottom-[calc(13.7rem+max(0.75rem,env(safe-area-inset-bottom,0px)))]",
      "max-h-[min(21rem,calc(100dvh-14.7rem-max(0.75rem,env(safe-area-inset-bottom,0px))))]",
      "z-[140]",
    );
    expect(dock).not.toHaveClass("inset-0");
    expect(screen.getByTestId("copilot-runtime")).toBe(runtime);
    expect(runtime).toHaveAttribute("data-active", "true");
    expect(runtime).toHaveAttribute("data-compact", "true");
    expect(document.body.style.pointerEvents).not.toBe("none");
    expect(document.body).not.toHaveAttribute("data-scroll-locked");

    fireEvent.click(
      screen.getByRole("button", { name: "Show full CoPilot conversation" }),
    );

    const dialog = screen.getByRole("dialog", { name: "Technician CoPilot" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveClass("inset-0", "z-40");
    expect(dialog).not.toHaveClass(
      "bottom-[calc(1rem+env(safe-area-inset-bottom))]",
      "max-h-[min(21rem,calc(100dvh-7rem))]",
      "z-[140]",
    );
    expect(screen.getByTestId("copilot-runtime")).toBe(runtime);
    expect(runtime).toHaveAttribute("data-compact", "false");

    fireEvent.click(
      screen.getByRole("button", { name: "Return to compact voice controls" }),
    );
    expect(
      screen.getByRole("region", { name: "Technician CoPilot" }),
    ).toBeVisible();
    expect(screen.getByTestId("copilot-runtime")).toBe(runtime);
    expect(runtime).toHaveAttribute("data-compact", "true");

    fireEvent.click(
      screen.getByRole("button", { name: "Close Technician CoPilot" }),
    );

    expect(dock).toHaveAttribute("aria-hidden", "true");
    expect(dock).toHaveClass("invisible", "pointer-events-none", "opacity-0");
    expect(screen.getByTestId("copilot-runtime")).toBe(runtime);
    expect(runtime).toHaveAttribute("data-active", "false");
    expect(document.body.style.pointerEvents).not.toBe("none");
    expect(document.body).not.toHaveAttribute("data-scroll-locked");

    fireEvent.click(
      screen.getByRole("button", { name: "Open Technician CoPilot" }),
    );

    expect(screen.getByTestId("copilot-runtime")).toBe(runtime);
    expect(runtime).toHaveAttribute("data-active", "true");
  });

  it.each([
    [
      "/mobile/work-orders/work-order-id",
      "bottom-[calc(10rem+env(safe-area-inset-bottom))]",
      "max-h-[min(21rem,calc(100dvh-16rem))]",
      "bottom-[calc(13.7rem+max(0.75rem,env(safe-area-inset-bottom,0px)))]",
      "max-h-[min(21rem,calc(100dvh-14.7rem-max(0.75rem,env(safe-area-inset-bottom,0px))))]",
    ],
    [
      "/mobile/jobs/work-order-line-id",
      "bottom-[calc(13.7rem+max(0.75rem,env(safe-area-inset-bottom,0px)))]",
      "max-h-[min(21rem,calc(100dvh-14.7rem-max(0.75rem,env(safe-area-inset-bottom,0px))))]",
      "bottom-[calc(10rem+env(safe-area-inset-bottom))]",
      "max-h-[min(21rem,calc(100dvh-16rem))]",
    ],
  ] as const)(
    "reserves the mobile workflow dock on %s while keeping expanded mode full-screen",
    (route, bottomClass, maxHeightClass, otherBottomClass, otherMaxHeightClass) => {
      pathname = route;
      render(<TechnicianCopilotShell shouldCheck surface="mobile" />);

      const launcher = screen.getByRole("button", {
        name: "Open Technician CoPilot",
      });
      expect(launcher).toHaveClass(bottomClass);
      expect(launcher).not.toHaveClass(
        "bottom-[calc(4.75rem+env(safe-area-inset-bottom))]",
        otherBottomClass,
      );

      fireEvent.click(launcher);

      const dock = screen.getByRole("region", {
        name: "Technician CoPilot",
      });
      expect(dock).toHaveClass(bottomClass, maxHeightClass, "z-40");
      expect(dock).not.toHaveClass(
        "bottom-[calc(1rem+env(safe-area-inset-bottom))]",
        "max-h-[min(21rem,calc(100dvh-7rem))]",
        otherBottomClass,
        otherMaxHeightClass,
        "inset-0",
        "z-[140]",
      );

      fireEvent.click(
        screen.getByRole("button", {
          name: "Show full CoPilot conversation",
        }),
      );

      const dialog = screen.getByRole("dialog", {
        name: "Technician CoPilot",
      });
      expect(dialog).toHaveClass(
        "inset-0",
        "h-[100dvh]",
        "w-full",
        "z-[140]",
      );
      expect(dialog).not.toHaveClass(
        bottomClass,
        maxHeightClass,
        otherBottomClass,
        otherMaxHeightClass,
        "z-40",
      );
      expect(screen.getByTestId("copilot-runtime")).toHaveAttribute(
        "data-compact",
        "false",
      );
    },
  );

  it.each([375, 390])(
    "keeps the standalone compact header usable at %ipx viewport height",
    (viewportHeight) => {
      const rootRem = 16;
      const compactHeaderHeight = 65;

      for (const safeAreaInset of [0, 34]) {
        const reservedBottom =
          13.7 * rootRem + Math.max(0.75 * rootRem, safeAreaInset);
        const maxHeight = Math.min(
          21 * rootRem,
          viewportHeight - reservedBottom - rootRem,
        );

        expect(maxHeight).toBeGreaterThan(compactHeaderHeight);
        expect(viewportHeight - reservedBottom - maxHeight).toBe(rootRem);
      }
    },
  );

  it("retains the 21rem standalone compact cap in portrait", () => {
    const rootRem = 16;
    const safeAreaInset = 34;
    const reservedBottom =
      13.7 * rootRem + Math.max(0.75 * rootRem, safeAreaInset);
    const maxHeight = Math.min(
      21 * rootRem,
      844 - reservedBottom - rootRem,
    );

    expect(maxHeight).toBe(21 * rootRem);
  });

  it("does not reserve a workflow dock for the work-order creation route", () => {
    pathname = "/mobile/work-orders/create";
    render(<TechnicianCopilotShell shouldCheck surface="mobile" />);

    expect(
      screen.getByRole("button", { name: "Open Technician CoPilot" }),
    ).toHaveClass("bottom-[calc(4.75rem+env(safe-area-inset-bottom))]");
    expect(
      screen.getByRole("button", { name: "Open Technician CoPilot" }),
    ).not.toHaveClass(
      "bottom-[calc(10rem+env(safe-area-inset-bottom))]",
      "bottom-[calc(13.7rem+max(0.75rem,env(safe-area-inset-bottom,0px)))]",
    );
  });

  it("opens the compact dock in place through the shared mobile action", () => {
    pathname = "/mobile";
    render(<TechnicianCopilotShell shouldCheck surface="mobile" />);

    act(() => openTechnicianCopilot());

    expect(
      screen.getByRole("region", { name: "Technician CoPilot" }),
    ).toBeVisible();
    expect(screen.getByTestId("copilot-runtime")).toHaveAttribute(
      "data-compact",
      "true",
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it("opens from the legacy mobile destination and returns to the job queue on close", () => {
    pathname = "/mobile/copilot/technician";
    render(<TechnicianCopilotShell shouldCheck surface="mobile" />);

    expect(
      screen.getByRole("region", { name: "Technician CoPilot" }),
    ).toBeVisible();
    const closeButtons = screen.getAllByRole("button", {
      name: "Close Technician CoPilot",
    });
    fireEvent.click(closeButtons.at(-1)!);

    expect(replace).toHaveBeenCalledWith("/mobile/tech/queue");
  });

  it("mounts one role-gated collaborator in each authenticated application shell", () => {
    const desktopShell = readFileSync(
      "features/shared/components/AppShell.tsx",
      "utf8",
    );
    const mobileShell = readFileSync(
      "components/layout/MobileShell.tsx",
      "utf8",
    );
    const desktopRoute = readFileSync(
      "app/copilot/technician/page.tsx",
      "utf8",
    );
    const mobileRoute = readFileSync(
      "app/mobile/copilot/technician/page.tsx",
      "utf8",
    );

    expect(desktopShell).toContain(
      'shouldCheck={canonicalizeRole(role) === "mechanic"}',
    );
    expect(mobileShell.match(/<TechnicianCopilotShell/g)).toHaveLength(1);
    expect(desktopShell).toContain(
      "resolveCanonicalStaffProfile(supabase, uid)",
    );
    expect(desktopShell).toContain("if (profile) setRole(profile.role)");
    expect(desktopRoute).not.toContain("<TechnicianTextCopilot");
    expect(mobileRoute).not.toContain("<TechnicianTextCopilot");
  });

  it("provides a terminal recovery state when a compatibility route is unavailable", () => {
    availability.state = {
      status: "unavailable",
      message: "Technician CoPilot is not enabled for this account.",
    };

    render(<TechnicianCopilotCompatibilityRoute returnHref="/tech/queue" />);

    expect(
      screen.getByRole("heading", { name: "Technician CoPilot unavailable" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Return to my jobs" }),
    ).toHaveAttribute("href", "/tech/queue");
  });

  it("keeps force-mounted dialogs inert while closed", () => {
    const sharedDialog = readFileSync(
      "features/shared/components/ui/dialog.tsx",
      "utf8",
    );

    expect(sharedDialog).toContain(
      "<DialogPortal forceMount={props.forceMount}>",
    );
    expect(sharedDialog).toContain(
      "<DialogOverlay forceMount={props.forceMount} />",
    );
    expect(sharedDialog).toContain("data-[state=closed]:pointer-events-none");
  });
});
