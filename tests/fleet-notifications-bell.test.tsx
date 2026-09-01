import type { ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import FleetNotificationsBell from "@/features/fleet/components/FleetNotificationsBell";

vi.mock("next/link", () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));

function notification(id: string, level: "warning" | "critical") {
  return {
    id,
    level,
    code: "fleet_pretrip_missing",
    title: "Missed pre-trip",
    message: "Needs review",
    createdAt: "2026-09-01T00:00:00.000Z",
    status: "active" as const,
  };
}

describe("Fleet notifications bell", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps loaded pages and severity state while polling the first page", async () => {
    let poll: TimerHandler | null = null;
    vi.stubGlobal(
      "setInterval",
      vi.fn((handler: TimerHandler, timeout?: number) => {
        if (timeout === 120000) poll = handler;
        return 1 as never;
      }),
    );
    const nextCursor = {
      lastSeenAt: "2026-09-01T00:00:00.000Z",
      id: "00000000-0000-4000-8000-000000000050",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            notifications: [notification("warning", "warning")],
            total: 51,
            nextCursor,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            notifications: [notification("critical", "critical")],
            total: null,
            nextCursor: null,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            notifications: [notification("warning", "warning")],
            total: 51,
            nextCursor,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            notifications: [notification("critical", "critical")],
            total: null,
            nextCursor: null,
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<FleetNotificationsBell />);

    const bell = await screen.findByRole("button", {
      name: "Fleet alerts (51)",
    });
    const badge = screen.getByText("51");
    expect(badge).toHaveClass("bg-slate-300");
    expect(badge).not.toHaveClass("bg-amber-300");

    fireEvent.click(bell);
    fireEvent.click(screen.getByRole("button", { name: /Load more alerts/i }));

    await waitFor(() => expect(badge).toHaveClass("bg-red-400"));
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      cursor: nextCursor,
    });

    await act(async () => {
      expect(poll).not.toBeNull();
      if (typeof poll === "function") poll();
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body))).toMatchObject({
      cursor: nextCursor,
    });
    expect(badge).toHaveClass("bg-red-400");
  });

  it("removes resolved alerts while preserving the loaded refresh depth", async () => {
    let poll: TimerHandler | null = null;
    vi.stubGlobal(
      "setInterval",
      vi.fn((handler: TimerHandler, timeout?: number) => {
        if (timeout === 120000) poll = handler;
        return 1 as never;
      }),
    );
    const nextCursor = {
      lastSeenAt: "2026-09-01T00:00:00.000Z",
      id: "00000000-0000-4000-8000-000000000050",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            notifications: [notification("warning", "warning")],
            total: 51,
            nextCursor,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            notifications: [notification("critical", "critical")],
            total: null,
            nextCursor: null,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            notifications: [notification("warning", "warning")],
            total: 1,
            nextCursor: null,
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<FleetNotificationsBell />);

    const bell = await screen.findByRole("button", {
      name: "Fleet alerts (51)",
    });
    fireEvent.click(bell);
    fireEvent.click(screen.getByRole("button", { name: /Load more alerts/i }));
    await waitFor(() => expect(screen.getByText("51")).toHaveClass("bg-red-400"));
    expect(screen.getAllByText("Missed pre-trip")).toHaveLength(2);

    await act(async () => {
      expect(poll).not.toBeNull();
      if (typeof poll === "function") poll();
    });

    await waitFor(() => expect(screen.getByText("1")).toHaveClass("bg-amber-300"));
    expect(screen.getAllByText("Missed pre-trip")).toHaveLength(1);
  });
});
