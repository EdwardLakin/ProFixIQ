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
    expect(runtime).toHaveAttribute("data-active", "false");

    fireEvent.click(
      screen.getByRole("button", { name: "Open Technician CoPilot" }),
    );

    const dock = screen.getByRole("region", { name: "Technician CoPilot" });
    expect(dock).toHaveAttribute("aria-hidden", "false");
    expect(dock).not.toHaveAttribute("aria-modal");
    expect(dock).toHaveClass(
      "visible",
      "pointer-events-auto",
      "opacity-100",
      "inset-x-3",
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
    expect(dialog).toHaveClass("inset-0");
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
    expect(desktopShell).toContain("resolveCanonicalStaffProfile(");
    expect(desktopShell).toContain("setRole(profile?.role ?? null)");
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
