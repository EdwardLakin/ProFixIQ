import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import RootShellBoundary from "../app/RootShellBoundary";

const mocks = vi.hoisted(() => ({
  pathname: "/shop/sign-in",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock("../app/providers", () => ({
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid="session-providers">{children}</div>
  ),
}));

vi.mock("@/features/branding/components/BrandThemeBoot", () => ({
  default: () => null,
}));

vi.mock("@/features/shared/components/AppShell", () => ({
  default: ({
    children,
    initialOutsideDesktopShell,
  }: {
    children: ReactNode;
    initialOutsideDesktopShell?: boolean;
  }) => (
    <div
      data-testid="app-shell"
      data-outside-desktop-shell={String(initialOutsideDesktopShell)}
    >
      {children}
    </div>
  ),
}));

vi.mock("@/features/shared/voice/VoiceProvider", () => ({
  VoiceProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe("root shell route transition", () => {
  beforeEach(() => {
    mocks.pathname = "/shop/sign-in";
  });

  it("mounts the protected AppShell when a public sign-in render crosses into the dashboard", () => {
    const view = render(
      <RootShellBoundary initialIdentity={null} initialSession={null}>
        <div>Route content</div>
      </RootShellBoundary>,
    );

    expect(screen.queryByTestId("app-shell")).not.toBeInTheDocument();
    expect(screen.queryByTestId("session-providers")).not.toBeInTheDocument();

    mocks.pathname = "/dashboard";
    view.rerender(
      <RootShellBoundary initialIdentity={null} initialSession={null}>
        <div>Route content</div>
      </RootShellBoundary>,
    );

    expect(screen.getByTestId("session-providers")).toBeInTheDocument();
    expect(screen.getByTestId("app-shell")).toHaveTextContent("Route content");
  });

  it("keeps dedicated mobile routes outside desktop chrome", () => {
    mocks.pathname = "/mobile";

    render(
      <RootShellBoundary initialIdentity={null} initialSession={null}>
        <div>Mobile route</div>
      </RootShellBoundary>,
    );

    expect(screen.getByTestId("session-providers")).toBeInTheDocument();
    expect(screen.getByTestId("app-shell")).toHaveAttribute(
      "data-outside-desktop-shell",
      "true",
    );
  });
});
