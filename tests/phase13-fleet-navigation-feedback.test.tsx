import type { AnchorHTMLAttributes, ReactNode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import FleetProductShell from "@/features/fleet/components/FleetProductShell";

const navigation = vi.hoisted(() => ({
  pathname: "/portal/fleet",
  search: "",
  prefetch: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
  useRouter: () => ({
    prefetch: navigation.prefetch,
    refresh: navigation.refresh,
    replace: navigation.replace,
  }),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/features/shared/lib/supabase/client", () => ({
  createBrowserSupabase: () => ({
    auth: { signOut: vi.fn().mockResolvedValue(undefined) },
  }),
}));

vi.mock("@/features/shared/components/ThemeToggleButton", () => ({
  default: () => <button type="button">Theme</button>,
}));

vi.mock("@/features/auth/components/ForcePasswordChangeModal", () => ({
  default: () => null,
}));

describe("Fleet navigation feedback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    navigation.pathname = "/portal/fleet";
    navigation.search = "";
    navigation.prefetch.mockClear();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(performance.now());
      return 1;
    });
    vi.spyOn(performance, "measure").mockImplementation(
      () => ({}) as PerformanceMeasure,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function renderShell() {
    return render(
      <FleetProductShell
        title="ProFixIQ Fleet"
        subtitle="Maintenance command"
        actorLabel="Fleet Manager"
        experience="external_manager"
        canAccessManagerWorkspaces
        userId={null}
        productHost={false}
      >
        <div>Fleet content</div>
      </FleetProductShell>,
    );
  }

  it("prefetches primary destinations and shows feedback on the initiating click", () => {
    renderShell();

    act(() => vi.runOnlyPendingTimers());
    expect(navigation.prefetch).toHaveBeenCalledWith("/portal/fleet");
    expect(navigation.prefetch).toHaveBeenCalledWith("/portal/fleet/units");

    fireEvent.click(screen.getByRole("link", { name: /Assets/i }));
    expect(
      screen.getByRole("status", { name: "Loading Fleet destination" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
  });

  it("does not show pending feedback when the active route is clicked", () => {
    renderShell();

    fireEvent.click(screen.getByRole("link", { name: /Control Tower/i }));
    expect(
      screen.queryByRole("status", { name: "Loading Fleet destination" }),
    ).not.toBeInTheDocument();
  });

  it("clears pending feedback after the destination commits", () => {
    const view = renderShell();

    fireEvent.click(screen.getByRole("link", { name: /Assets/i }));
    navigation.pathname = "/portal/fleet/units";
    view.rerender(
      <FleetProductShell
        title="ProFixIQ Fleet"
        subtitle="Maintenance command"
        actorLabel="Fleet Manager"
        experience="external_manager"
        canAccessManagerWorkspaces
        userId={null}
        productHost={false}
      >
        <div>Assets content</div>
      </FleetProductShell>,
    );

    expect(
      screen.queryByRole("status", { name: "Loading Fleet destination" }),
    ).not.toBeInTheDocument();
    expect(performance.measure).toHaveBeenCalledWith(
      "profixiq:fleet:route-navigation",
      expect.objectContaining({
        start: expect.any(Number),
        end: expect.any(Number),
      }),
    );
  });

  it("uses the selected Fleet membership for shell role and navigation", () => {
    navigation.search = "fleetId=30000000-0000-4000-8000-00000000000b";

    render(
      <FleetProductShell
        title="ProFixIQ Fleet"
        subtitle="Today’s inspections, reported issues and updates"
        actorLabel="Fleet Driver"
        experience="external_driver"
        canAccessManagerWorkspaces={false}
        fleetContexts={{
          "30000000-0000-4000-8000-00000000000b": {
            actorLabel: "Fleet Manager",
            experience: "external_manager",
            canAccessManagerWorkspaces: true,
            subtitle:
              "Asset readiness, preventive maintenance and repair decisions",
          },
        }}
        userId={null}
        productHost={false}
      >
        <div>Fleet content</div>
      </FleetProductShell>,
    );

    expect(screen.getByText("Fleet Manager")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Drivers/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Driver shortcuts" }),
    ).not.toBeInTheDocument();
  });
});
