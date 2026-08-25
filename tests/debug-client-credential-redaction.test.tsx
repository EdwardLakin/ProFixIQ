import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ClientDebug from "../app/debug/client/page";

const mocks = vi.hoisted(() => {
  const getSession = vi.fn();
  const getUser = vi.fn();
  const onAuthStateChange = vi.fn();
  const unsubscribe = vi.fn();

  return {
    getSession,
    getUser,
    onAuthStateChange,
    unsubscribe,
    client: {
      auth: {
        getSession,
        getUser,
        onAuthStateChange,
      },
    },
  };
});

vi.mock("@/features/shared/lib/supabase/client", () => ({
  createBrowserSupabase: () => mocks.client,
}));

const sensitiveSession = {
  access_token: "ACCESS_TOKEN_SENTINEL",
  refresh_token: "REFRESH_TOKEN_SENTINEL",
  provider_token: "PROVIDER_TOKEN_SENTINEL",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id: "USER_ID_SENTINEL",
    email: "owner-sentinel@example.com",
    phone: "+15555550123",
    user_metadata: {
      full_name: "Edward Sentinel",
    },
  },
} as unknown as Session;

const sensitiveValues = [
  "ACCESS_TOKEN_SENTINEL",
  "REFRESH_TOKEN_SENTINEL",
  "PROVIDER_TOKEN_SENTINEL",
  "USER_ID_SENTINEL",
  "owner-sentinel@example.com",
  "+15555550123",
  "Edward Sentinel",
  "access_token",
  "refresh_token",
  "provider_token",
  "userId:",
];

let authStateCallback:
  | ((event: AuthChangeEvent, session: Session | null) => void)
  | null = null;

function expectSafeSessionSummary(container: HTMLElement): void {
  expect(screen.getByText("Client Auth / Context Debug")).toBeInTheDocument();
  expect(screen.getByText("hasSession:").parentElement).toHaveTextContent(
    "true",
  );
  expect(screen.getByText("expiresInSec:").parentElement).not.toHaveTextContent(
    "?",
  );
  expect(container.querySelector("pre")).not.toBeInTheDocument();

  for (const value of sensitiveValues) {
    expect(container).not.toHaveTextContent(value);
  }
}

describe("client auth diagnostics credential redaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStateCallback = null;
    mocks.getSession.mockResolvedValue({
      data: { session: sensitiveSession },
      error: null,
    });
    mocks.getUser.mockResolvedValue({
      data: { user: sensitiveSession.user },
      error: null,
    });
    mocks.onAuthStateChange.mockImplementation(
      (callback: (event: AuthChangeEvent, session: Session | null) => void) => {
        authStateCallback = callback;
        return {
          data: {
            subscription: {
              unsubscribe: mocks.unsubscribe,
            },
          },
        };
      },
    );
  });

  afterEach(() => {
    cleanup();
  });

  it("renders only non-identifying session health for an existing session", async () => {
    const { container } = render(<ClientDebug />);

    await waitFor(() => {
      expectSafeSessionSummary(container);
    });
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("redacts the payload when an auth-state event signs the browser in", async () => {
    mocks.getSession.mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });
    const { container, unmount } = render(<ClientDebug />);

    await waitFor(() => {
      expect(screen.getByText("hasSession:").parentElement).toHaveTextContent(
        "false",
      );
    });
    expect(authStateCallback).not.toBeNull();

    act(() => {
      authStateCallback?.("SIGNED_IN", sensitiveSession);
    });

    expectSafeSessionSummary(container);
    expect(mocks.getUser).not.toHaveBeenCalled();

    unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });
});
