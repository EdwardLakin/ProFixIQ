/** @vitest-environment jsdom */

import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useFieldServiceVerifiedScope } from "@/features/mobile/service/FieldServiceVerifiedScope";
import MobileFieldServiceRouteGate from "@/features/mobile/service/MobileFieldServiceRouteGate";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  authCallback: null as null | (
    (event: string, session: { user: { id: string } } | null) => void
  ),
  unsubscribe: vi.fn(),
  offlineScope: null as { userId: string; shopId: string } | null,
  setOfflineMutationScope: vi.fn(),
  removeFieldActiveSnapshot: vi.fn(),
  pathname: "/mobile/service",
  router: { replace: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => mocks.router,
}));

vi.mock("@/features/shared/lib/supabase/client", () => ({
  createBrowserSupabase: () => ({
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
    },
  }),
}));

vi.mock("@/features/shared/lib/offline/mutations", () => ({
  getOfflineMutationScope: () => mocks.offlineScope,
  isRetryableOfflineStatus: vi.fn((status: number) => status === 408),
  setOfflineMutationScope: mocks.setOfflineMutationScope,
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

vi.mock("@/features/mobile/service/fieldActiveSnapshot", () => ({
  removeFieldActiveSnapshot: mocks.removeFieldActiveSnapshot,
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

function ScopeProbe() {
  const scope = useFieldServiceVerifiedScope();
  return (
    <>
      <div>{`${scope.userId}:${scope.shopId}`}</div>
      <input aria-label="scoped field draft" defaultValue="" />
    </>
  );
}

describe("MobileFieldServiceRouteGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = "/mobile/service";
    mocks.authCallback = null;
    mocks.offlineScope = null;
    mocks.onAuthStateChange.mockImplementation((callback) => {
      mocks.authCallback = callback;
      return {
        data: { subscription: { unsubscribe: mocks.unsubscribe } },
      };
    });
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

  it("fails closed when a cross-tab sign-in changes users and access revalidation fails", async () => {
    const userA = "00000000-0000-4000-8000-000000000001";
    const userB = "00000000-0000-4000-8000-000000000003";
    const shop = "00000000-0000-4000-8000-000000000002";
    mocks.fetch.mockResolvedValueOnce(response(accessPayload()));

    render(
      <MobileFieldServiceRouteGate>
        <ScopeProbe />
      </MobileFieldServiceRouteGate>,
    );

    expect(await screen.findByText(`${userA}:${shop}`)).toBeInTheDocument();

    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: userB } } },
    });
    mocks.fetch.mockResolvedValueOnce(
      response({ error: "temporarily unavailable" }, 503),
    );
    act(() =>
      mocks.authCallback?.("SIGNED_IN", { user: { id: userB } }),
    );

    expect(screen.queryByText(`${userA}:${shop}`)).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(`${userA}:${shop}`)).not.toBeInTheDocument();
  });

  it("removes the former actor's active-call snapshot on sign-out", async () => {
    const user = "00000000-0000-4000-8000-000000000001";
    const shop = "00000000-0000-4000-8000-000000000002";
    mocks.fetch.mockResolvedValueOnce(response(accessPayload()));

    render(
      <MobileFieldServiceRouteGate>
        <ScopeProbe />
      </MobileFieldServiceRouteGate>,
    );

    expect(await screen.findByText(`${user}:${shop}`)).toBeInTheDocument();

    act(() => mocks.authCallback?.("SIGNED_OUT", null));

    expect(mocks.removeFieldActiveSnapshot).toHaveBeenCalledWith({
      userId: user,
      shopId: shop,
    });
    expect(screen.queryByText(`${user}:${shop}`)).not.toBeInTheDocument();
  });

  it("remounts descendants only after a same-user shop change is reverified", async () => {
    const user = "00000000-0000-4000-8000-000000000001";
    const shopA = "00000000-0000-4000-8000-000000000002";
    const shopB = "00000000-0000-4000-8000-000000000004";
    let resolveRevalidation!: (value: Response) => void;
    const revalidation = new Promise<Response>((resolve) => {
      resolveRevalidation = resolve;
    });
    mocks.fetch
      .mockResolvedValueOnce(response(accessPayload()))
      .mockReturnValueOnce(revalidation);

    render(
      <MobileFieldServiceRouteGate>
        <ScopeProbe />
      </MobileFieldServiceRouteGate>,
    );

    expect(await screen.findByText(`${user}:${shopA}`)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("scoped field draft"), {
      target: { value: "shop A draft" },
    });

    act(() =>
      mocks.authCallback?.("SIGNED_IN", { user: { id: user } }),
    );
    expect(screen.getByText(`${user}:${shopA}`)).toBeInTheDocument();
    expect(screen.getByLabelText("scoped field draft")).toHaveValue(
      "shop A draft",
    );
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));

    await act(async () => {
      resolveRevalidation(
        response(accessPayload({ shopId: shopB, userId: user })),
      );
      await revalidation;
    });

    expect(await screen.findByText(`${user}:${shopB}`)).toBeInTheDocument();
    expect(screen.queryByText(`${user}:${shopA}`)).not.toBeInTheDocument();
    expect(screen.getByLabelText("scoped field draft")).toHaveValue("");
  });

  it("keeps same-user Field work mounted through the SDK SIGNED_IN refocus event", async () => {
    const user = "00000000-0000-4000-8000-000000000001";
    let resolveRevalidation!: (value: Response) => void;
    const revalidation = new Promise<Response>((resolve) => {
      resolveRevalidation = resolve;
    });
    mocks.fetch
      .mockResolvedValueOnce(response(accessPayload()))
      .mockReturnValueOnce(revalidation);

    render(
      <MobileFieldServiceRouteGate>
        <input aria-label="field draft" defaultValue="" />
      </MobileFieldServiceRouteGate>,
    );

    const input = await screen.findByLabelText("field draft");
    fireEvent.change(input, { target: { value: "unsaved field note" } });

    act(() =>
      mocks.authCallback?.("SIGNED_IN", { user: { id: user } }),
    );
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("field draft")).toHaveValue(
      "unsaved field note",
    );

    await act(async () => {
      resolveRevalidation(response(accessPayload()));
      await revalidation;
    });

    expect(screen.getByLabelText("field draft")).toHaveValue(
      "unsaved field note",
    );
  });

  it("preserves a verified same-user workspace when background access returns 5xx", async () => {
    mocks.fetch
      .mockResolvedValueOnce(response(accessPayload()))
      .mockResolvedValueOnce(response({ error: "temporarily unavailable" }, 503));

    render(
      <MobileFieldServiceRouteGate>
        <input aria-label="field draft" defaultValue="" />
      </MobileFieldServiceRouteGate>,
    );

    const input = await screen.findByLabelText("field draft");
    fireEvent.change(input, { target: { value: "keep this note" } });

    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));

    expect(screen.getByLabelText("field draft")).toHaveValue("keep this note");
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it("clears a different persisted actor before verifying a first signed-in user", async () => {
    const formerUser = "00000000-0000-4000-8000-000000000005";
    const nextUser = "00000000-0000-4000-8000-000000000006";
    let resolveAccess!: (value: Response) => void;
    const pendingAccess = new Promise<Response>((resolve) => {
      resolveAccess = resolve;
    });
    mocks.offlineScope = {
      userId: formerUser,
      shopId: "00000000-0000-4000-8000-000000000002",
    };
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: nextUser } } },
    });
    mocks.fetch.mockReturnValue(pendingAccess);

    render(
      <MobileFieldServiceRouteGate>
        <div>protected field content</div>
      </MobileFieldServiceRouteGate>,
    );
    await waitFor(() => expect(mocks.onAuthStateChange).toHaveBeenCalled());

    act(() =>
      mocks.authCallback?.("INITIAL_SESSION", { user: { id: nextUser } }),
    );

    expect(mocks.setOfflineMutationScope).toHaveBeenCalledWith(null);
    expect(screen.queryByText("protected field content")).not.toBeInTheDocument();

    await act(async () => {
      resolveAccess(
        response(
          accessPayload({ userId: nextUser }),
        ),
      );
      await pendingAccess;
    });
  });

  it("hides new-path children until the persistent layout reauthorizes that pathname", async () => {
    let resolveNextPath!: (value: Response) => void;
    const nextPathAccess = new Promise<Response>((resolve) => {
      resolveNextPath = resolve;
    });
    mocks.fetch
      .mockResolvedValueOnce(response(accessPayload()))
      .mockReturnValueOnce(nextPathAccess);

    const { rerender } = render(
      <MobileFieldServiceRouteGate>
        <div>Field hub content</div>
      </MobileFieldServiceRouteGate>,
    );
    expect(await screen.findByText("Field hub content")).toBeInTheDocument();

    mocks.pathname = "/mobile/service/jobs";
    rerender(
      <MobileFieldServiceRouteGate>
        <div>Jobs route content</div>
      </MobileFieldServiceRouteGate>,
    );

    expect(screen.queryByText("Jobs route content")).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));

    await act(async () => {
      resolveNextPath(response(accessPayload()));
      await nextPathAccess;
    });

    expect(await screen.findByText("Jobs route content")).toBeInTheDocument();
  });
});
