import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  });

  it("keeps severity neutral until all paginated alerts are represented", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            notifications: [notification("warning", "warning")],
            total: 51,
            nextOffset: 50,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            notifications: [notification("critical", "critical")],
            total: 51,
            nextOffset: null,
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
  });
});
