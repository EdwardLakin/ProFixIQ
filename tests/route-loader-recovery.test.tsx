// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MobileServiceScopeGate from "@/features/mobile/service/MobileServiceScopeGate";
import RapidServiceIntake from "@/features/mobile/service/RapidServiceIntake";
import { loadOptionalQuoteEvidence } from "@/features/portal/lib/loadOptionalQuoteEvidence";
import type { WorkOrderEvidenceItem } from "@/features/work-orders/lib/evidence/workOrderEvidence";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  authCallback: null as null | (
    (event: string, session: { user: { id: string } } | null) => void
  ),
  unsubscribe: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mocks,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/features/shared/lib/supabase/client", () => ({
  createBrowserSupabase: () => ({
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
    },
  }),
}));

vi.mock("@/features/mobile/service/FieldHub", () => ({
  default: ({
    children,
    scope,
  }: {
    children?: ReactNode;
    scope: { userId: string; shopId: string };
  }) => (
    <div>
      {`${scope.userId}:${scope.shopId}`}
      <input aria-label="field hub draft" defaultValue="" />
      {children}
    </div>
  ),
}));

function response(body: unknown, status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  mocks.authCallback = null;
  mocks.onAuthStateChange.mockImplementation((callback) => {
    mocks.authCallback = callback;
    return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
  });
  mocks.getSession.mockResolvedValue({ data: { session: null } });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("route loader recovery behavior", () => {
  it("returns quote lines without evidence when the media endpoint is unavailable", async () => {
    const request = vi.fn().mockResolvedValue(response({ error: "down" }, 503));
    const recordStatus = vi.fn();

    const result = await loadOptionalQuoteEvidence({
      workOrderId: "wo-1",
      signal: new AbortController().signal,
      recordStatus,
      request: request as typeof fetch,
    });

    expect(result.items).toEqual([]);
    expect(result.warning).toMatchObject({
      kind: "network",
      retryable: true,
      status: 503,
    });
    expect(recordStatus).toHaveBeenCalledWith(503);
  });

  it("returns canonical quote evidence when the media endpoint succeeds", async () => {
    const item = { id: "evidence-1" } as WorkOrderEvidenceItem;
    const request = vi.fn().mockResolvedValue(response({ items: [item] }, 200));

    const result = await loadOptionalQuoteEvidence({
      workOrderId: "wo-1",
      signal: new AbortController().signal,
      recordStatus: vi.fn(),
      request: request as typeof fetch,
    });

    expect(result).toEqual({ items: [item], warning: null });
  });

  it("keeps rapid intake usable with defaults after settings fail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ error: "unavailable" }, 503)),
    );

    render(<RapidServiceIntake />);

    expect(
      await screen.findByText("Using default service settings"),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "New service call" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Time allowed")).toHaveValue("60");
    expect(
      screen.getByRole("button", { name: "Save call · ETA 30 min" }),
    ).toBeVisible();
  });

  it("clears protected snapshots and redirects signed-out Field users", async () => {
    window.localStorage.setItem(
      "profixiq:mobile-service:active:v1",
      JSON.stringify({ visits: ["stale"] }),
    );
    window.localStorage.setItem(
      "profixiq:mobile-service:active-scope:v1",
      JSON.stringify({ userId: "former-user", shopId: "shop-1" }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ error: "unauthenticated" }, 401)),
    );

    render(<MobileServiceScopeGate />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/mobile"));
    expect(
      window.localStorage.getItem("profixiq:mobile-service:active:v1"),
    ).toBeNull();
    expect(
      window.localStorage.getItem("profixiq:mobile-service:active-scope:v1"),
    ).toBeNull();
    expect(screen.queryByText("Sign in required")).not.toBeInTheDocument();
  });

  it("unmounts the Field hub immediately on a cross-tab sign-out", async () => {
    const userId = "00000000-0000-4000-8000-000000000001";
    const shopId = "00000000-0000-4000-8000-000000000002";
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: userId } } },
    });
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        response(
          {
            decision: "ready",
            canAccessFieldService: true,
            canConfigure: false,
            mustChangePassword: false,
            productEntitled: true,
            shopId,
            userId,
            workspaceCapabilities: {},
          },
          200,
        ),
      )
      .mockResolvedValueOnce(response({ error: "unauthenticated" }, 401));
    vi.stubGlobal("fetch", request);

    render(<MobileServiceScopeGate />);

    expect(await screen.findByText(`${userId}:${shopId}`)).toBeInTheDocument();

    mocks.getSession.mockResolvedValue({ data: { session: null } });
    act(() => mocks.authCallback?.("SIGNED_OUT", null));

    expect(screen.queryByText(`${userId}:${shopId}`)).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/mobile"));
  });

  it("preserves the same-user Field hub through SIGNED_IN refocus and transient 5xx", async () => {
    const userId = "00000000-0000-4000-8000-000000000001";
    const shopId = "00000000-0000-4000-8000-000000000002";
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: userId } } },
    });
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        response(
          {
            decision: "ready",
            canAccessFieldService: true,
            canConfigure: false,
            mustChangePassword: false,
            productEntitled: true,
            shopId,
            userId,
            workspaceCapabilities: {},
          },
          200,
        ),
      )
      .mockResolvedValueOnce(
        response({ error: "temporarily unavailable" }, 503),
      );
    vi.stubGlobal("fetch", request);

    render(<MobileServiceScopeGate />);

    const draft = await screen.findByLabelText("field hub draft");
    fireEvent.change(draft, { target: { value: "unsaved hub note" } });

    act(() =>
      mocks.authCallback?.("SIGNED_IN", { user: { id: userId } }),
    );
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));

    expect(screen.getByLabelText("field hub draft")).toHaveValue(
      "unsaved hub note",
    );
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
