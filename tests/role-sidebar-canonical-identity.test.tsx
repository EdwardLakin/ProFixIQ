import { readFileSync } from "node:fs";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import RoleSidebar from "@/features/shared/components/RoleSidebar";
import { resolveCanonicalStaffProfile } from "@/features/shared/lib/authenticated-profile";

const mocks = vi.hoisted(() => ({
  pathname: "/dashboard",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock(
  "@/features/copilot/technician/client/useTechnicianCopilotAvailability",
  () => ({
    useTechnicianCopilotAvailability: () => false,
  }),
);

vi.mock("@/features/workspace/authorization/useWorkspaceCapabilities", () => ({
  useWorkspaceCapabilities: () => ({ can: () => false }),
}));

afterEach(cleanup);

describe("RoleSidebar canonical identity", () => {
  beforeEach(() => {
    mocks.pathname = "/dashboard";
  });

  it("renders navigation when the parent recovers identity after a null server render", async () => {
    const view = render(<RoleSidebar initialRole={null} initialEmail={null} />);

    expect(screen.getByText("Loading navigation…")).toBeInTheDocument();

    view.rerender(
      <RoleSidebar initialRole="manager" initialEmail="manager@example.com" />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("link", { name: "Shop Overview" }),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("Loading navigation…")).not.toBeInTheDocument();
  });

  it("removes owner-only navigation when a mounted shell receives a manager role", async () => {
    mocks.pathname = "/dashboard/owner/settings";
    const view = render(
      <RoleSidebar initialRole="owner" initialEmail="owner@example.com" />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("link", { name: "Owner Settings" }),
      ).toBeInTheDocument();
    });

    view.rerender(
      <RoleSidebar initialRole="manager" initialEmail="owner@example.com" />,
    );

    expect(
      screen.queryByRole("link", { name: "Owner Settings" }),
    ).not.toBeInTheDocument();
  });

  it("clears prior navigation when the controlled identity is removed", async () => {
    const view = render(
      <RoleSidebar initialRole="manager" initialEmail="manager@example.com" />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("link", { name: "Shop Overview" }),
      ).toBeInTheDocument();
    });

    view.rerender(<RoleSidebar initialRole={null} initialEmail={null} />);

    expect(screen.getByText("Loading navigation…")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Shop Overview" }),
    ).not.toBeInTheDocument();
  });

  it("updates email-restricted navigation from controlled identity props", async () => {
    mocks.pathname = "/property/setup";
    const view = render(
      <RoleSidebar
        initialRole="owner"
        initialEmail="edwardlakin35@gmail.com"
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("link", { name: "Property Setup" }),
      ).toBeInTheDocument();
    });

    view.rerender(
      <RoleSidebar initialRole="owner" initialEmail="owner@example.com" />,
    );

    expect(
      screen.queryByRole("link", { name: "Property Setup" }),
    ).not.toBeInTheDocument();
  });

  it("keeps one canonical AppShell identity owner", () => {
    const appShell = readFileSync(
      "features/shared/components/AppShell.tsx",
      "utf8",
    );
    const roleSidebar = readFileSync(
      "features/shared/components/RoleSidebar.tsx",
      "utf8",
    );

    expect(appShell).toContain("setRole(initialIdentity?.role ?? null)");
    expect(appShell).toContain("initialRole={role}");
    expect(appShell).toContain("initialEmail={userEmail}");
    expect(roleSidebar).toContain("const role = normalizeRole(initialRole)");
    expect(roleSidebar).not.toContain("createBrowserSupabase");
    expect(roleSidebar).not.toContain('.from("profiles")');
    expect(roleSidebar).not.toContain("auth.getSession");
  });
});

describe("canonical imported staff profile", () => {
  it("falls back from profiles.id to profiles.user_id deterministically", async () => {
    const calls: Array<{ column: string; value: string }> = [];
    const linkedProfile = {
      id: "profile-id",
      role: "manager",
      shop_id: "shop-id",
      completed_onboarding: true,
      must_change_password: false,
      email: "manager@example.com",
      full_name: "Imported Manager",
    };
    const client = {
      from: () => ({
        select: () => ({
          eq: (column: string, value: string) => {
            calls.push({ column, value });
            return {
              maybeSingle: async () =>
                column === "id"
                  ? { data: null, error: null }
                  : { data: linkedProfile, error: null },
            };
          },
        }),
      }),
    };

    const result = await resolveCanonicalStaffProfile(
      client as never,
      "auth-user-id",
    );

    expect(calls).toEqual([
      { column: "id", value: "auth-user-id" },
      { column: "user_id", value: "auth-user-id" },
    ]);
    expect(result).toEqual({ profile: linkedProfile, error: null });
  });
});
