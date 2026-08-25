import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AppShell from "@/features/shared/components/AppShell";

const mocks = vi.hoisted(() => ({
  pathname: "/dashboard",
  routerPush: vi.fn(),
  routerRefresh: vi.fn(),
  routerReplace: vi.fn(),
  getSession: vi.fn(),
  signOut: vi.fn(),
  resolveCanonicalStaffProfile: vi.fn(),
  from: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
  fetchMobileShiftState: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({
    push: mocks.routerPush,
    refresh: mocks.routerRefresh,
    replace: mocks.routerReplace,
  }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/features/shared/lib/supabase/client", () => ({
  createBrowserSupabase: () => ({
    auth: {
      getSession: mocks.getSession,
      signOut: mocks.signOut,
    },
    from: mocks.from,
    channel: mocks.channel,
    removeChannel: mocks.removeChannel,
  }),
}));

vi.mock("@/features/shared/lib/authenticated-profile", () => ({
  resolveCanonicalStaffProfile: mocks.resolveCanonicalStaffProfile,
}));

vi.mock("@/features/shared/components/RoleSidebar", () => ({
  default: ({
    initialRole,
    initialEmail,
  }: {
    initialRole?: string | null;
    initialEmail?: string | null;
  }) => (
    <div
      data-testid="role-sidebar-probe"
      data-role={initialRole ?? ""}
      data-email={initialEmail ?? ""}
    />
  ),
}));

vi.mock("@shared/components/ShiftTracker", () => ({
  default: () => null,
}));

vi.mock("@/features/mobile/shifts/client", () => ({
  fetchMobileShiftState: mocks.fetchMobileShiftState,
}));

vi.mock("@/features/chat/components/InboxModal", () => ({
  default: () => null,
}));

vi.mock("@/features/agent/components/AgentRequestModal", () => ({
  default: () => null,
}));

vi.mock("@/features/shared/components/tabs/TabsBridge", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/features/auth/components/ForcePasswordChangeModal", () => ({
  default: () => null,
}));

vi.mock("@/features/assistant/components/AskAssistantEntry", () => ({
  default: () => null,
}));

vi.mock("@/features/branding/hooks/useActiveBrand", () => ({
  useActiveBrand: () => ({ data: null }),
}));

vi.mock("@/features/shared/components/OpsNotificationsBell", () => ({
  default: () => null,
}));

vi.mock(
  "@/features/copilot/technician/components/TechnicianCopilotShell",
  () => ({ TechnicianCopilotShell: () => null }),
);

type InitialIdentity = NonNullable<
  ComponentProps<typeof AppShell>["initialIdentity"]
>;

function session(userId = "auth-user-id", email = "auth@example.com") {
  return {
    data: {
      session: {
        user: { id: userId, email },
      },
    },
  };
}

function profile(role: string, email = "profile@example.com") {
  return {
    id: "canonical-profile-id",
    role,
    shop_id: null,
    completed_onboarding: true,
    must_change_password: false,
    email,
    full_name: "Imported Staff",
  };
}

function identity(role: string): InitialIdentity {
  return {
    userId: "auth-user-id",
    email: "same-user@example.com",
    shopId: null,
    role,
  };
}

describe("AppShell canonical identity handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = "/dashboard";
    mocks.fetchMobileShiftState.mockResolvedValue(null);
    mocks.from.mockImplementation(() => {
      const query = {
        select: vi.fn(),
        eq: vi.fn(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      query.select.mockReturnValue(query);
      query.eq.mockReturnValue(query);
      return query;
    });
    mocks.channel.mockImplementation(() => {
      const channel = {
        on: vi.fn(),
        subscribe: vi.fn(),
      };
      channel.on.mockReturnValue(channel);
      channel.subscribe.mockReturnValue(channel);
      return channel;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("hands a canonically linked imported profile to the sidebar after a null server render", async () => {
    mocks.getSession.mockResolvedValue(session());
    mocks.resolveCanonicalStaffProfile.mockResolvedValue({
      profile: profile("manager", "imported@example.com"),
      error: null,
    });

    render(
      <AppShell initialIdentity={null}>
        <div>Protected route</div>
      </AppShell>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("role-sidebar-probe")).toHaveAttribute(
        "data-role",
        "manager",
      );
    });
    expect(screen.getByTestId("role-sidebar-probe")).toHaveAttribute(
      "data-email",
      "imported@example.com",
    );
    expect(mocks.resolveCanonicalStaffProfile).toHaveBeenCalledWith(
      expect.any(Object),
      "auth-user-id",
    );
  });

  it("does not let an older profile response overwrite a newer role revision", async () => {
    let releaseOldProfile: ((value: unknown) => void) | null = null;
    const oldProfile = new Promise((resolve) => {
      releaseOldProfile = resolve;
    });

    mocks.getSession.mockResolvedValue(
      session("auth-user-id", "same-user@example.com"),
    );
    mocks.resolveCanonicalStaffProfile
      .mockImplementationOnce(() => oldProfile)
      .mockResolvedValueOnce({
        profile: profile("manager", "same-user@example.com"),
        error: null,
      });

    const view = render(
      <AppShell initialIdentity={identity("owner")}>
        <div>Protected route</div>
      </AppShell>,
    );

    await waitFor(() => {
      expect(mocks.resolveCanonicalStaffProfile).toHaveBeenCalledTimes(1);
    });

    view.rerender(
      <AppShell initialIdentity={identity("manager")}>
        <div>Protected route</div>
      </AppShell>,
    );

    await waitFor(() => {
      expect(mocks.resolveCanonicalStaffProfile).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId("role-sidebar-probe")).toHaveAttribute(
        "data-role",
        "manager",
      );
    });

    await act(async () => {
      releaseOldProfile?.({
        profile: profile("owner", "same-user@example.com"),
        error: null,
      });
      await oldProfile;
    });

    expect(screen.getByTestId("role-sidebar-probe")).toHaveAttribute(
      "data-role",
      "manager",
    );
    expect(mocks.channel).toHaveBeenCalledTimes(1);
  });

  it("retains server-validated navigation during a transient null browser session", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });

    render(
      <AppShell initialIdentity={identity("owner")}>
        <div>Protected route</div>
      </AppShell>,
    );

    await waitFor(() => {
      expect(mocks.getSession).toHaveBeenCalled();
    });

    expect(screen.getByTestId("role-sidebar-probe")).toHaveAttribute(
      "data-role",
      "owner",
    );
    expect(mocks.resolveCanonicalStaffProfile).not.toHaveBeenCalled();
  });
});
