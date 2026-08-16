import React from "react";
import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
let pathname = "/dashboard";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ replace }),
}));

vi.mock(
  "@/features/copilot/technician/client/useTechnicianCopilotAvailability",
  () => ({ useTechnicianCopilotAvailability: () => true }),
);

vi.mock(
  "@/features/copilot/technician/components/TechnicianTextCopilot",
  () => ({
    TechnicianTextCopilot: ({ active }: { active?: boolean }) => (
      <div data-testid="copilot-runtime" data-active={String(active)} />
    ),
  }),
);

import { TechnicianCopilotShell } from "@/features/copilot/technician/components/TechnicianCopilotShell";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

describe("persistent Technician CoPilot shell", () => {
  beforeEach(() => {
    pathname = "/dashboard";
    replace.mockReset();
  });

  it("keeps one collaborator runtime mounted while the panel opens and closes", () => {
    render(<TechnicianCopilotShell shouldCheck surface="desktop" />);

    expect(screen.getByTestId("copilot-runtime")).toHaveAttribute(
      "data-active",
      "false",
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Technician CoPilot" }));

    expect(screen.getByRole("dialog", { name: "Technician CoPilot" })).toBeVisible();
    expect(screen.getByTestId("copilot-runtime")).toHaveAttribute(
      "data-active",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Close Technician CoPilot" }));

    expect(screen.getByTestId("copilot-runtime")).toHaveAttribute(
      "data-active",
      "false",
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it("opens from the legacy mobile destination and returns to the job queue on close", () => {
    pathname = "/mobile/copilot/technician";
    render(<TechnicianCopilotShell shouldCheck surface="mobile" />);

    expect(screen.getByRole("dialog", { name: "Technician CoPilot" })).toBeVisible();
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
    expect(mobileShell.match(/<TechnicianCopilotShell/g)).toHaveLength(3);
    expect(desktopRoute).not.toContain("<TechnicianTextCopilot");
    expect(mobileRoute).not.toContain("<TechnicianTextCopilot");
  });
});
