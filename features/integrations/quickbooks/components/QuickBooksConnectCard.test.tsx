import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import QuickBooksConnectCard from "./QuickBooksConnectCard";

function mockConnectedStatus(environment: "sandbox" | "production") {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        connected: true,
        connection: {
          id: "connection-1",
          realmId: "realm-1",
          environment,
          connectedAt: "2026-07-20T18:08:17.000Z",
          isActive: true,
          lastSyncAt: null,
          lastError: null,
        },
      }),
    }),
  );
}

describe("QuickBooksConnectCard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("links a connected sandbox company to the QuickBooks sandbox", async () => {
    mockConnectedStatus("sandbox");

    render(<QuickBooksConnectCard />);

    expect(await screen.findByRole("link", { name: "Open QuickBooks" })).toHaveAttribute(
      "href",
      "https://sandbox.qbo.intuit.com/app/homepage",
    );
  });

  it("links a connected production company to QuickBooks Online", async () => {
    mockConnectedStatus("production");

    render(<QuickBooksConnectCard />);

    const link = await screen.findByRole("link", { name: "Open QuickBooks" });
    expect(link).toHaveAttribute("href", "https://qbo.intuit.com/app/homepage");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
