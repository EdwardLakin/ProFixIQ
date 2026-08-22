// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MobileServiceScopeGate from "@/features/mobile/service/MobileServiceScopeGate";
import RapidServiceIntake from "@/features/mobile/service/RapidServiceIntake";
import { loadOptionalQuoteEvidence } from "@/features/portal/lib/loadOptionalQuoteEvidence";
import type { WorkOrderEvidenceItem } from "@/features/work-orders/lib/evidence/workOrderEvidence";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
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
    auth: { getSession: mocks.getSession },
  }),
}));

vi.mock("@/features/mobile/service/FieldHub", () => ({
  default: ({ children }: { children?: ReactNode }) => <>{children}</>,
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
    expect(screen.getByRole("heading", { name: "New service call" })).toBeVisible();
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
      window.localStorage.getItem(
        "profixiq:mobile-service:active-scope:v1",
      ),
    ).toBeNull();
    expect(screen.queryByText("Sign in required")).not.toBeInTheDocument();
  });
});
