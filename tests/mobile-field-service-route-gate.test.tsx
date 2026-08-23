/** @vitest-environment jsdom */

import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import MobileFieldServiceRouteGate from "@/features/mobile/service/MobileFieldServiceRouteGate";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  getSession: vi.fn(),
  pathname: "/mobile/service",
  router: { replace: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => mocks.router,
}));

vi.mock("@/features/shared/lib/supabase/client", () => ({
  createBrowserSupabase: () => ({
    auth: { getSession: mocks.getSession },
  }),
}));

vi.mock("@/features/shared/lib/offline/mutations", () => ({
  getOfflineMutationScope: vi.fn(() => null),
  isRetryableOfflineStatus: vi.fn((status: number) => status === 408),
  setOfflineMutationScope: vi.fn(),
}));

vi.mock("@/features/mobile/service/fieldOfflineAccess", () => ({
  clearFieldServiceOfflineAccess: vi.fn(),
  readFieldServiceOfflineAccess: vi.fn(() => null),
  resolveFieldServiceAccessScope: vi.fn(
    (payload: { shopId?: string; userId?: string }) =>
      payload.shopId && payload.userId
        ? { shopId: payload.shopId, userId: payload.userId }
        : null,
  ),
  writeFieldServiceOfflineAccess: vi.fn(),
}));

vi.mock("@/features/shared/lib/route-load", () => {
  class TestRouteLoadFailure extends Error {
    constructor(input: { message: string }) {
      super(input.message);
    }
  }

  return {
    asRouteLoadFailure: (error: Error, fallback: string) => ({
      kind: "network",
      message: error.message || fallback,
    }),
    RouteLoadFailure: TestRouteLoadFailure,
    routeLoadFailureFromStatus: (_status: number, message: string) =>
      new TestRouteLoadFailure({ message }),
    runBoundedRouteLoad: async (
      _context: unknown,
      operation: (controls: {
        recordStatus: (status: number) => void;
        signal: AbortSignal;
      }) => Promise<void>,
    ) =>
      operation({
        recordStatus: vi.fn(),
        signal: new AbortController().signal,
      }),
  };
});

const accessPayload = (overrides: Record<string, unknown> = {}) => ({
  decision: "ready",
  canAccessFieldService: true,
  canConfigure: false,
  mustChangePassword: false,
  productEntitled: true,
  shopId: "00000000-0000-4000-8000-000000000002",
  userId: "00000000-0000-4000-8000-000000000001",
  ...overrides,
});

const response = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("MobileFieldServiceRouteGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = "/mobile/service";
    mocks.getSession.mockResolvedValue({
      data: {
        session: {
          user: { id: "00000000-0000-4000-8000-000000000001" },
        },
      },
    });
    vi.stubGlobal("fetch", mocks.fetch);
  });

  it("keeps an authorized form mounted during background revalidation", async () => {
    let resolveRevalidation!: (value: Response) => void;
    const revalidation = new Promise<Response>((resolve) => {
      resolveRevalidation = resolve;
    });
    mocks.fetch
      .mockResolvedValueOnce(response(accessPayload()))
      .mockReturnValueOnce(revalidation);

    render(
      <MobileFieldServiceRouteGate>
        <input aria-label="inspection note" defaultValue="" />
      </MobileFieldServiceRouteGate>,
    );

    const input = await screen.findByLabelText("inspection note");
    fireEvent.change(input, { target: { value: "unsaved brake note" } });

    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));

    expect(screen.getByLabelText("inspection note")).toHaveValue(
      "unsaved brake note",
    );

    await act(async () => {
      resolveRevalidation(response(accessPayload()));
      await revalidation;
    });

    expect(screen.getByLabelText("inspection note")).toHaveValue(
      "unsaved brake note",
    );
  });

  it("forces password rotation before allowing a configurator into setup", async () => {
    mocks.pathname = "/mobile/service/setup";
    mocks.fetch.mockResolvedValueOnce(
      response(
        accessPayload({
          decision: "forbidden",
          canAccessFieldService: false,
          canConfigure: true,
          mustChangePassword: true,
        }),
        403,
      ),
    );

    render(
      <MobileFieldServiceRouteGate>
        <div>setup form</div>
      </MobileFieldServiceRouteGate>,
    );

    await waitFor(() =>
      expect(mocks.router.replace).toHaveBeenCalledWith(
        "/auth/set-password?redirect=%2Fmobile%2Fservice%2Fsetup",
      ),
    );
    expect(screen.queryByText("setup form")).not.toBeInTheDocument();
  });
});
